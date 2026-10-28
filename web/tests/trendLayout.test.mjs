import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreLayout, defaultLayout, layoutRows, moveToColumn, moveInReadingOrder, appendWidget, WIDGET_GAP, WIDGET_SHORT_HEIGHT } from '../src/utils/trendLayout.ts';
const defs=[{id:'cash',size:'tall'},{id:'holdings'},{id:'goals'},{id:'status'},{id:'category',size:'tall'},{id:'ranking'}];
test('legacy migration preserves hidden and empty boards and gives one tall card two short neighbours',()=>{
 const layout=restoreLayout(null,['cash','holdings','goals','cash','removed'],defs);
 assert.deepEqual(layout,[{id:'cash',column:0},{id:'holdings',column:1},{id:'goals',column:1}]);
 assert.deepEqual(restoreLayout(null,[],defs),[]);
 assert.deepEqual(restoreLayout([],['cash'],defs),[]);
});
test('each column stacks independently with exactly two height sizes',()=>{
 const rows=layoutRows([{id:'cash',column:0},{id:'category',column:1},{id:'goals',column:1},{id:'holdings',column:0}],defs);
 assert.deepEqual(rows.map(p=>[p.id,p.row,p.span]),[['cash',1,2],['category',1,2],['goals',3,1],['holdings',3,1]]);
 const height=span=>span*WIDGET_SHORT_HEIGHT+(span-1)*WIDGET_GAP;
 assert.equal(height(2),2*height(1)+WIDGET_GAP);
 assert.equal(rows[2].row,3); // Adding the right short card did not create a new full-width row.
});
test('cross-column insertion handles empty lane, head, and tail without losing other items',()=>{
 const start=[{id:'cash',column:0},{id:'category',column:0},{id:'goals',column:0}];
 let next=moveToColumn(start,'cash',1,0);
 assert.deepEqual(next.filter(p=>p.column===1),[{id:'cash',column:1}]);
 next=moveToColumn(next,'goals',1,0);
 assert.deepEqual(next.filter(p=>p.column===1).map(p=>p.id),['goals','cash']);
 next=moveToColumn(next,'category',1,99);
 assert.deepEqual(next.map(p=>p.id),['goals','cash','category']);
 assert.deepEqual(start,[{id:'cash',column:0},{id:'category',column:0},{id:'goals',column:0}]);
 assert.equal(new Set(next.map(p=>p.id)).size,3);
 assert.deepEqual(moveToColumn(next,'unknown',0,0),next);
});
test('mobile order changes retain desktop column choices, and v2 survives refresh',()=>{
 const start=[{id:'cash',column:1},{id:'holdings',column:0},{id:'goals',column:0}];
 const next=moveInReadingOrder(start,'cash',2);
 assert.deepEqual(next,[{id:'holdings',column:0},{id:'goals',column:0},{id:'cash',column:1}]);
 assert.deepEqual(restoreLayout(JSON.parse(JSON.stringify(next)),null,defs),next);
 assert.deepEqual(restoreLayout([{id:'cash',column:1},{id:'cash',column:0},{id:'missing',column:1}],null,defs),[{id:'cash',column:1}]);
 assert.deepEqual(restoreLayout({bad:true},null,defs),defaultLayout(defs.map(d=>d.id),defs));
});
test('restoring hidden widget adds to the shorter lane without changing saved column assignments',()=>{
 const layout=[{id:'cash',column:1},{id:'holdings',column:0}];
 assert.deepEqual(appendWidget(layout,'goals',defs),[...layout,{id:'goals',column:0}]);
 assert.deepEqual(appendWidget(layout,'cash',defs),layout);
});
