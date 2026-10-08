const test = require('node:test');
const assert = require('node:assert/strict');
class MockStorage { constructor(){this.m={};} getItem(k){return k in this.m?this.m[k]:null;} setItem(k,v){this.m[k]=String(v);} removeItem(k){delete this.m[k];} }
global.window = {};
require('../js/manage.js');

test('发布成功', () => {
  const s = new MockStorage();
  const r = window.CampusManage.savePost({type:'lost',name:'黑伞',place:'图书馆',time:'2026-10-07T08:10',contact:'wx:1',desc:'1'}, s);
  assert.equal(r.ok, true);
});
test('空名称失败', () => {
  const s = new MockStorage();
  const r = window.CampusManage.savePost({type:'lost',name:' ',place:'图书馆',time:'2026-10-07T08:10',contact:'wx:1'}, s);
  assert.equal(r.ok, false);
});
test('只显示本人', () => {
  const s = new MockStorage();
  window.CampusManage.savePost({type:'lost',name:'伞',place:'图',time:'1',contact:'1'}, s);
  assert.equal(window.CampusManage.getMyPosts(s).length, 1);
});
test('改状态成功', () => {
  const s = new MockStorage();
  const r = window.CampusManage.savePost({type:'lost',name:'伞',place:'图',time:'1',contact:'1'}, s);
  assert.equal(window.CampusManage.updateStatus(r.post.id,'已找到',s).ok, true);
});