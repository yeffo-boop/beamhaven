import { describe, expect, it } from "vitest";

import { centsCell, csvFileName, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("writes a header and rows with a byte-order mark and CRLF endings", () => {
    expect(
      toCsv(
        ["Name", "Amount"],
        [
          ["Tile", { cents: 123456n }],
          [null, { cents: -500n }],
        ],
      ),
    ).toBe("﻿Name,Amount\r\nTile,1234.56\r\n,-5.00\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv(["A"], [['Say "hi", then\nleave']])).toBe('﻿A\r\n"Say ""hi"", then\nleave"\r\n');
  });

  it("stops text from running as a spreadsheet formula", () => {
    const csv = toCsv(["A"], [['=HYPERLINK("x")'], ["+1"], ["-2"], ["@SUM(A1)"], ["ok = fine"]]);
    expect(csv.split("\r\n").slice(1, 6)).toEqual([
      '"\'=HYPERLINK(""x"")"',
      "'+1",
      "'-2",
      "'@SUM(A1)",
      "ok = fine",
    ]);
    // Money is a number, so a negative amount stays a number.
    expect(centsCell(-1n)).toBe("-0.01");
  });

  it("makes safe file names", () => {
    expect(csvFileName("Budget", "Kitchen / Bath №2")).toBe("budget-kitchen-bath-no2.csv");
    expect(csvFileName("Café")).toBe("cafe.csv");
    expect(csvFileName("../..")).toBe("report.csv");
  });
});
