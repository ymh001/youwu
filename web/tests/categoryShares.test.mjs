import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryShares} from '../src/utils/categoryShares.ts';
test('category shares represent amounts rather than asset counts',()=>{const r=categoryShares([{id:'a',value:300,count:1},{id:'b',value:100,count:9}]);assert.equal(r.total,400);assert.deepEqual(r.items.map(c=>c.share),[.75,.25]);});
test('sale profits are preserved but cannot form negative slices',()=>{const r=categoryShares([{id:'a',value:100},{id:'b',value:-30},{id:'c',value:0}]);assert.equal(r.total,100);assert.deepEqual(r.items.map(c=>c.share),[1,0,0]);assert.equal(r.items[1].value,-30);});
test('empty and nonpositive data produce no invalid percentages',()=>{for(const data of [[],[{value:0}],[{value:-10}]]){const r=categoryShares(data);assert.equal(r.total,0);assert.ok(r.items.every(c=>c.share===0));}});
