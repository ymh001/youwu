import test from 'node:test';
import assert from 'node:assert/strict';
import {amountInput} from '../src/utils/amountInput.ts';
import {formSnapshot} from '../src/utils/formSnapshot.ts';

test('money inputs pad integers and cents without rounding existing precision',()=>{
 for(const [value,expected]of [[228,'228.00'],[0,'0.00'],[12.5,'12.50'],[0.125,'0.125'],[-3,'-3.00'],['1.2300','1.2300'],[null,''],[undefined,''],['',''],[1e-7,'1e-7'],['.5','0.50'],['-.5','-0.50']]) {
  assert.equal(amountInput(value),expected);
  if(value!=null&&value!=='')assert.equal(Number(amountInput(value)),Number(value));
 }
});
test('equivalent monetary edits do not trigger dirty confirmation; blank and zero stay distinct',()=>{
 const base={price:'228.00',custom_daily:'0.125',target_daily:'5.00',sold_price:'0.00',tag_ids:[],attachments:[],target_quantity:'3.00'};
 assert.equal(formSnapshot(base),formSnapshot({...base,price:'228',target_daily:'5',sold_price:'0'}));
 for(const field of ['price','custom_daily','target_daily','sold_price']) {
  assert.notEqual(formSnapshot(base),formSnapshot({...base,[field]:''}));
  assert.notEqual(formSnapshot(base),formSnapshot({...base,[field]:'999'}));
 }
 assert.notEqual(formSnapshot(base),formSnapshot({...base,target_quantity:'3'}));
});
