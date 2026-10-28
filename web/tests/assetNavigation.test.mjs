import test from 'node:test';
import assert from 'node:assert/strict';
import {assetReturnPath} from '../src/utils/assetNavigation.ts';
const id='a'.repeat(32),parent='b'.repeat(32);
test('wish returns to wishlist even when opened directly',()=>{assert.equal(assetReturnPath({id,type:'wish'},undefined,[]),'/wish');assert.equal(assetReturnPath({id,type:'wish'},'/',[]),'/wish');});
test('accessory returns to its surviving source detail',()=>assert.equal(assetReturnPath({id,type:'asset'},`/asset/${parent}`,[parent]),`/asset/${parent}`));
test('missing, self and external sources fall back to assets',()=>{for(const from of [`/asset/${parent}`,`/asset/${id}`,'https://example.com',undefined])assert.equal(assetReturnPath({id,type:'asset'},from,[]),'/');});
