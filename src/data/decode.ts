import Encoding from "encoding-japanese";

export function decodeCsvBytes(input: ArrayBuffer | string): string {
  if (typeof input === "string") return input;
  const bytes = new Uint8Array(input);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  const detected = Encoding.detect(bytes);
  if (detected === "UTF8" || detected === "ASCII") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  return Encoding.convert(bytes, { to: "UNICODE", from: "SJIS", type: "string" }) as string;
}
