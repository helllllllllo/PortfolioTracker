import { describe, it, expect } from "vitest";
import Encoding from "encoding-japanese";
import { decodeCsvBytes } from "./decode";

function utf8WithBom(text: string): ArrayBuffer {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out.buffer;
}
function sjis(text: string): ArrayBuffer {
  const bytes = Encoding.convert(Encoding.stringToCode(text), { to: "SJIS", from: "UNICODE" });
  return new Uint8Array(bytes).buffer;
}

describe("decodeCsvBytes", () => {
  it("passes through strings unchanged", () => {
    expect(decodeCsvBytes("入金額")).toBe("入金額");
  });
  it("decodes UTF-8 with BOM and strips the BOM", () => {
    expect(decodeCsvBytes(utf8WithBom("入出金日,入金額"))).toBe("入出金日,入金額");
  });
  it("decodes Shift-JIS", () => {
    expect(decodeCsvBytes(sjis("約定日,銘柄コード"))).toBe("約定日,銘柄コード");
  });
});
