# Bitget AI MCP probe responses (exploratory, 2026-10-02)

These files are the unmodified raw responses saved during the initial data-feasibility spike, when
`https://agent.bitget.com/mcp` was reachable from the build machine (around 13:14 to 13:20 UTC on 2026-10-02).
They were obtained with `curl` against the Streamable HTTP endpoint (initialize, tools/list, tools/call),
not through the application's MCP client.

| File | Request |
| --- | --- |
| tools.sse, tools.json | `tools/list` (server `bitget-mcp-server` 4.0.5; tools `guide`, `do_query`) |
| guide_equity.json | `tools/call guide {"category":"equity"}` |
| guide_etf.json | `tools/call guide {"category":"etf"}` |
| hist1.json | `do_query equity_price_historical {"symbol":"NVDA"}` (HTTP 204, no data) |
| hist2.json, hist3.json | `do_query equity_price_historical` with second and millisecond ranges (HTTP 204, no data) |

During the same session, `do_query equity_fundamental_dividends`, `equity_calendar` and `equity_price_quote`
returned data for NVDA. Those responses were viewed but not saved to disk, so they are not reproduced here.

These probe files establish reachability and the discovered tool catalog. They are not the integrated
receipts required for the integration gate: those are written by `npm run data:mcp` to `data/tool-receipts.json`.
After the network changed (mobile hotspot), the host became unreachable at the IP level and the
integrated calls have not yet succeeded. See docs/GATES.md (G5).
