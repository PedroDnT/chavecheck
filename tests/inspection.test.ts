import {test} from "node:test";
import assert from "node:assert/strict";
import {compareItem,createDemo} from "../src/lib/inspection";
test("demo shows exact quantity, overdue and value differences, without auto approvals",()=>{
  const inspection=createDemo();
  assert.deepEqual(inspection.items.flatMap(i=>compareItem(i,inspection.date)).map(d=>d.kind),["Quantidade","Prazo","Valor"]);
  assert.ok(inspection.items.every(i=>i.status==="pendente"));
});
test("unknown values and unconfirmed completion never invent a mismatch",()=>{
  const i=createDemo().items[0]; i.expected.quantity=null; i.expected.dueDate="2026-10-20";i.delivered.status="nao_informado";
  assert.equal(compareItem(i,"2026-10-23").length,0);
});
test("deadline is inclusive and completed dates determine lateness",()=>{
  const i=createDemo().items[2];assert.equal(compareItem(i,"2026-10-20").length,0);
  i.delivered.status="entregue";i.delivered.completedDate="2026-10-19";assert.equal(compareItem(i,"2026-10-23").length,0);
  i.delivered.completedDate="2026-10-21";assert.equal(compareItem(i,"2026-10-23")[0].kind,"Prazo");
});
