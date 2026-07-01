#!/usr/bin/python3
"""Generate a landscape portfolio pie chart PNG from broker CSV data.

Supports two broker formats:
  * SBI    — legacy "ポートフォリオ一覧" CSV (cp932, stock-only)
  * MIZUHO — "預り資産（預り証券）" CSV (utf-8-sig, multi-asset: 株式/投信/債券/外株/MRF)

Default invocation (no args) preserves legacy behaviour and renders SBI from
``New_file.csv`` → ``portfolio_pie_chart.png`` so existing workflows keep working.
"""

import argparse
import csv
import math
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

SCRIPT_DIR = Path(__file__).parent

BG_COLOR = '#ffffff'
TEXT_PRIMARY = '#1a1a1a'
TEXT_SECONDARY = '#6b7280'
TEXT_MUTED = '#9ca3af'

# Expanded palette — MIZUHO can have 15+ holdings when stocks/funds/bonds/MRF
# are combined. Colors picked to stay readable on white with low adjacency clash.
COLORS = [
    '#2563eb', '#7c3aed', '#0d9488', '#ea580c', '#0284c7',
    '#4f46e5', '#0891b2', '#16a34a', '#d97706', '#db2777',
    '#65a30d', '#9333ea', '#dc2626', '#0369a1', '#78716c',
    '#059669', '#c026d3', '#b45309', '#1d4ed8', '#be123c',
]

# Try Japanese-capable fonts in order: Hiragino (macOS) → Yu Gothic (macOS/Win) →
# Noto CJK (Linux) → Droid Sans Fallback (Linux sandbox). Matplotlib will walk
# the list and use the first one it finds, so the script renders correctly
# both on the user's Mac and in a Linux runner.
matplotlib.rcParams['font.family'] = [
    'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic',
    'Noto Sans CJK JP', 'Noto Sans JP',
    'Droid Sans Fallback', 'DejaVu Sans',
]
# Suppress the noisy "Font family X not found" warnings from the fallback walk
import warnings
warnings.filterwarnings('ignore', message='Glyph .* missing from font')
import logging
logging.getLogger('matplotlib.font_manager').setLevel(logging.ERROR)


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def _clean_number(s):
    """Strip +, commas, whitespace; return float. Raises ValueError on failure."""
    return float(str(s).replace('+', '').replace(',', '').strip())


def parse_sbi(path):
    """SBI ポートフォリオ一覧 format (cp932).

    Layout: metadata rows, then a section title row containing "株式", then a
    column header row that includes "評価額", then one row per tax-lot.
    Column count varies between exports (some include an extra 取得単価
    column), so we locate the 評価額 column dynamically rather than hard-coding
    its index. A summary row appears near the end.
    """
    stocks = defaultdict(lambda: {'name': '', 'valuation': 0})
    total_val = total_pnl = pnl_pct = 0

    with open(path, encoding='cp932') as f:
        rows = list(csv.reader(f))

    # Find the column header row (contains "評価額") and the data start row.
    val_idx = 10  # legacy default if header isn't found
    name_idx = None
    data_start = 8
    for i, row in enumerate(rows[:30]):
        if any('評価額' == (c or '').strip() for c in row):
            for j, c in enumerate(row):
                header = (c or '').strip()
                if header == '評価額':
                    val_idx = j
                elif header == '銘柄名称':
                    name_idx = j
            data_start = i + 1
            break

    for row in rows[data_start:]:
        if not row or not row[0]:
            continue
        cell0 = row[0].strip()
        if '合計' in cell0 or '株式' in cell0:
            continue

        # Summary values row (starts with a raw number)
        try:
            val = _clean_number(cell0)
            if val > 1_000_000:
                total_val = int(val)
                total_pnl = int(_clean_number(row[1]))
                pnl_pct = _clean_number(row[2])
                continue
        except (ValueError, IndexError):
            pass

        if name_idx is not None and len(row) > name_idx:
            code = unicodedata.normalize('NFKC', cell0)
            name = unicodedata.normalize('NFKC', (row[name_idx] or '').strip())
        else:
            parts = cell0.split(None, 1)
            if len(parts) < 2:
                continue
            code = unicodedata.normalize('NFKC', parts[0])
            name = unicodedata.normalize('NFKC', parts[1])

        if not name:
            continue

        try:
            valuation = int(_clean_number(row[val_idx]))
        except (ValueError, IndexError):
            continue

        stocks[code]['name'] = name
        stocks[code]['valuation'] += valuation

    holdings = [
        {'code': code, 'name': info['name'], 'valuation': info['valuation']}
        for code, info in stocks.items()
    ]
    holdings.sort(key=lambda x: x['valuation'], reverse=True)

    if total_val == 0:
        total_val = sum(h['valuation'] for h in holdings)

    return {
        'holdings': holdings,
        'total_val': total_val,
        'total_pnl': total_pnl,
        'pnl_pct': pnl_pct,
        'broker': 'SBI',
    }


def parse_mizuho(path):
    """MIZUHO 預り資産（預り証券）format (utf-8-sig).

    Structure:
      * Title rows, then an MRF/お預り金 summary block (row starts "MRF/お預り金").
      * A detail header row starting with "商品,銘柄コード,..." followed by
        per-position rows. Same instrument appears multiple times across
        預り区分 (特定/NISA/一般) — must aggregate.

    Column indices on the detail rows:
        [0] 商品 ∈ {株式, 投信, 債券, 外株}
        [1] 銘柄コード           (empty for 投信/債券)
        [2] ティッカーコード     (set for 外株 e.g. AMZN)
        [3] 銘柄名
        [6] 保有数量
       [15] 評価額（円)          ← primary figure
       [16] 評価損益（円)
    MRF cash is included as a synthetic holding (keyed "MRF").
    """
    holdings_by_key = defaultdict(lambda: {'code': '', 'name': '', 'valuation': 0,
                                            'category': ''})
    mrf_val = 0
    total_pnl = 0

    with open(path, encoding='utf-8-sig') as f:
        rows = list(csv.reader(f))

    in_detail = False
    for row in rows:
        if not row:
            continue
        cell0 = (row[0] or '').strip()

        # MRF cash balance
        if cell0.startswith('MRF'):
            try:
                mrf_val = int(_clean_number(row[3]))  # 評価額 column
            except (ValueError, IndexError):
                pass
            continue

        # Detail table header — flip into detail-row mode
        if cell0 == '商品':
            in_detail = True
            continue

        if not in_detail:
            continue

        category = cell0
        if category not in ('株式', '投信', '債券', '外株'):
            continue

        # Extract identifying fields
        code = (row[1] or '').strip()
        ticker = (row[2] or '').strip() if len(row) > 2 else ''
        name = unicodedata.normalize('NFKC', (row[3] or '').strip())

        # Prefer ticker for foreign stocks, 銘柄コード otherwise; fall back to name
        # so 投信/債券 still aggregate cleanly.
        if category == '外株' and ticker:
            key = ticker
            display_code = ticker
        elif code:
            key = code
            display_code = unicodedata.normalize('NFKC', code)
        else:
            key = name
            display_code = ''

        try:
            valuation = int(_clean_number(row[15]))
        except (ValueError, IndexError):
            continue

        # 評価損益 (may be blank for e.g. 一般 rows without 取得金額)
        try:
            pnl = int(_clean_number(row[16]))
        except (ValueError, IndexError):
            pnl = 0

        h = holdings_by_key[key]
        h['code'] = display_code
        h['name'] = name
        h['category'] = category
        h['valuation'] += valuation
        total_pnl += pnl

    holdings = [
        {'code': info['code'], 'name': info['name'],
         'valuation': info['valuation'], 'category': info['category']}
        for info in holdings_by_key.values()
    ]

    # Add MRF as a synthetic cash holding
    if mrf_val > 0:
        holdings.append({'code': '', 'name': 'MRF / お預り金',
                         'valuation': mrf_val, 'category': '現金'})

    holdings.sort(key=lambda x: x['valuation'], reverse=True)
    total_val = sum(h['valuation'] for h in holdings)
    pnl_pct = (total_pnl / (total_val - total_pnl) * 100) if total_val - total_pnl else 0

    return {
        'holdings': holdings,
        'total_val': total_val,
        'total_pnl': total_pnl,
        'pnl_pct': pnl_pct,
        'broker': 'MIZUHO',
    }


# ---------------------------------------------------------------------------
# Chart
# ---------------------------------------------------------------------------

def create_chart(data, hide_amounts=False):
    """Render the donut chart.

    When ``hide_amounts`` is True, every ¥ figure is suppressed — total value,
    absolute PnL, and per-holding amounts in the legend. Only percentages and
    the holding count remain. Use this when the chart will be shared and
    absolute net worth must not be inferable.
    """
    stocks = data['holdings']
    total_val = data['total_val']
    broker = data['broker']

    fig = plt.figure(figsize=(16, 9), dpi=150)
    fig.patch.set_facecolor(BG_COLOR)

    today = date.today().strftime('%Y/%m/%d')
    # When hiding amounts, also drop the broker name from the title and the
    # PnL subtitle entirely — both reveal more than the user wants in a
    # shareable view (broker = which account, PnL% = return rate).
    title = f'Portfolio Allocation — {today}' if hide_amounts else \
            f'{broker} Portfolio Allocation — {today}'
    fig.text(0.5, 0.95, title, ha='center', va='center',
             fontsize=13, color=TEXT_MUTED)

    if not hide_amounts:
        subtitle_parts = [f'Total ¥{total_val:,}']
        if data.get('total_pnl'):
            sign = '+' if data['total_pnl'] >= 0 else ''
            subtitle_parts.append(
                f'PnL {sign}¥{data["total_pnl"]:,} ({sign}{data["pnl_pct"]:.2f}%)')
        fig.text(0.5, 0.915, '   ·   '.join(subtitle_parts),
                 ha='center', va='center', fontsize=10, color=TEXT_SECONDARY)

    # Donut chart (left ~62% of canvas)
    ax_pie = fig.add_axes([0.02, 0.04, 0.58, 0.82])
    ax_pie.set_facecolor(BG_COLOR)

    valuations = [s['valuation'] for s in stocks]
    # Cycle palette if holdings exceed COLORS length
    colors = [COLORS[i % len(COLORS)] for i in range(len(stocks))]

    ax_pie.pie(
        valuations,
        colors=colors,
        startangle=90,
        counterclock=False,
        wedgeprops={'width': 0.4, 'edgecolor': BG_COLOR, 'linewidth': 2},
    )

    ax_pie.text(0, 0, f'{len(stocks)} holdings', ha='center', va='center',
                fontsize=14, fontweight='bold', color=TEXT_PRIMARY)

    # Percentage labels on slices ≥5%
    start = 90
    for s in stocks:
        pct = s['valuation'] / total_val * 100
        sweep = pct / 100 * 360
        mid_angle = start - sweep / 2
        rad = math.radians(mid_angle)
        label_r = 0.82
        if pct >= 5:
            ax_pie.text(label_r * math.cos(rad), label_r * math.sin(rad),
                        f'{pct:.1f}%', ha='center', va='center',
                        fontsize=9, color=TEXT_PRIMARY, fontweight='bold')
        start -= sweep

    # Legend (right ~38% of canvas)
    ax_leg = fig.add_axes([0.62, 0.04, 0.36, 0.82])
    ax_leg.set_facecolor(BG_COLOR)
    ax_leg.set_xlim(0, 1)
    ax_leg.set_ylim(0, 1)
    ax_leg.axis('off')

    n = len(stocks)
    row_height = 0.92 / max(n, 1)
    y_start = 0.96
    # Dynamic font size: shrink when many rows so legend fits
    base_font = 12 if n <= 10 else (11 if n <= 14 else 10)

    for i, s in enumerate(stocks):
        y = y_start - i * row_height
        pct = s['valuation'] / total_val * 100

        swatch = FancyBboxPatch(
            (0.02, y - 0.012), 0.03, 0.024,
            boxstyle='round,pad=0.003',
            facecolor=colors[i], edgecolor='none',
        )
        ax_leg.add_patch(swatch)

        label = f'{s["code"]} {s["name"]}'.strip()
        ax_leg.text(0.075, y, label,
                    fontsize=base_font, fontweight='medium', color=TEXT_PRIMARY,
                    va='center', ha='left')

        # Right column: amount + pct, or pct only when hiding amounts.
        right_text = f'{pct:.1f}%' if hide_amounts else f'¥{s["valuation"]:,}   {pct:.1f}%'
        ax_leg.text(0.995, y, right_text,
                    fontsize=base_font - 1, fontweight='bold', color=TEXT_SECONDARY,
                    va='center', ha='right')

    return fig


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

BROKERS = {
    # SBI defaults to hide_amounts=True: charts get shared and we don't want
    # absolute net worth to be inferable. Override with --show-amounts.
    'sbi':    {'parser': parse_sbi,    'default_input': 'New_file.csv',
               'default_output': 'portfolio_pie_chart.png',
               'hide_amounts': True},
    'mizuho': {'parser': parse_mizuho, 'default_input': 'mizuho.csv',
               'default_output': 'portfolio_pie_chart_mizuho.png',
               'hide_amounts': False},
}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--broker', choices=list(BROKERS), default='sbi',
                    help='Broker format to parse (default: sbi, preserves legacy behaviour).')
    ap.add_argument('--input', type=Path, default=None,
                    help='CSV path; defaults per-broker.')
    ap.add_argument('--output', type=Path, default=None,
                    help='PNG path; defaults per-broker.')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--hide-amounts', dest='hide_amounts', action='store_true',
                   default=None, help='Suppress all ¥ figures; show percentages only.')
    g.add_argument('--show-amounts', dest='hide_amounts', action='store_false',
                   default=None, help='Show ¥ figures (override per-broker default).')
    args = ap.parse_args()

    cfg = BROKERS[args.broker]
    csv_path = args.input or (SCRIPT_DIR / cfg['default_input'])
    out_path = args.output or (SCRIPT_DIR / cfg['default_output'])
    hide_amounts = cfg['hide_amounts'] if args.hide_amounts is None else args.hide_amounts

    data = cfg['parser'](csv_path)
    fig = create_chart(data, hide_amounts=hide_amounts)
    fig.savefig(out_path, dpi=150, facecolor=BG_COLOR, edgecolor='none',
                bbox_inches='tight', pad_inches=0.3)
    plt.close(fig)
    summary = f'¥{data["total_val"]:,}' if not hide_amounts else 'amounts hidden'
    print(f'[{args.broker}] {len(data["holdings"])} holdings · {summary} → {out_path}')


if __name__ == '__main__':
    main()
