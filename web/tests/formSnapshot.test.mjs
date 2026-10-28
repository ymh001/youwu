import test from 'node:test';
import assert from 'node:assert/strict';
import {formSnapshot} from '../src/utils/formSnapshot.ts';

const initial = {
  name:'相机', price:'100', type:'asset', purchase_date:'2026-10-28',
  notes:'', image_url:'/media/original/display.png', icon:'📦',
  tag_ids:['a','b'], attachments:[{id:'first',name:'发票',url:'/file'}],
  category_id:'camera', target_daily:'5', target_completed:'0', exclude_daily:false,
};
test('every editable value participates, including non-text controls', () => {
  for (const [field,value] of Object.entries({
    name:'镜头', price:'200', type:'wish', purchase_date:'2026-10-27',
    notes:'喜欢', image_url:'/media/new/display.png', icon:'📷', tag_ids:['a'],
    attachments:[], category_id:'other', target_daily:'2', target_completed:'1', exclude_daily:true,
  })) assert.notEqual(formSnapshot({...initial,[field]:value}), formSnapshot(initial), field);
});
test('reverting edits and reselecting the same tags is clean', () => {
  const changed = {...initial,name:'改动',tag_ids:['b','a']};
  assert.equal(formSnapshot({...changed,name:initial.name}), formSnapshot(initial));
});
test('new asset and new wish defaults each form their own clean baseline', () => {
  for (const type of ['asset','wish']) {
    const defaults={...initial,name:'',price:'',type,tag_ids:[],attachments:[]};
    const baseline=formSnapshot(defaults);
    assert.equal(formSnapshot({...defaults}),baseline);
    assert.notEqual(formSnapshot({...defaults,type:type==='wish'?'asset':'wish'}),baseline);
  }
});
test('loaded edit baseline is independent of later changes and attachment metadata', () => {
  const loaded={...initial,attachments:[{id:'first',name:'发票',url:'/file'}]};
  const baseline=formSnapshot(loaded);
  loaded.notes='新备注';
  assert.notEqual(formSnapshot(loaded),baseline);
  loaded.notes='';
  loaded.attachments[0].url='/refreshed-url';
  assert.equal(formSnapshot(loaded),baseline);
  loaded.attachments[0].id='replacement';
  assert.notEqual(formSnapshot(loaded),baseline);
});
