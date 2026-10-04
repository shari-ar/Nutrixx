# Consumption source

| File                         | Responsibility                                       |
| ---------------------------- | ---------------------------------------------------- |
| `model.ts`                   | Meal, item, head, event, command, and record schemas |
| `ledger.ts`                  | Atomic record/correction and current/history queries |
| `index.ts`                   | Public package surface                               |
| `consumption-ledger.test.ts` | IndexedDB integration and domain-invariant tests     |
