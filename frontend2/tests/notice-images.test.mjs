import assert from 'node:assert/strict';
import {noticeImages} from '../dist/notice-images.js';
assert.deepEqual(noticeImages({title:'공지'}),[]);
const images=noticeImages({title:'모집 안내',images:[
 {url:'https://example.com/a.png',alt:'포스터'},'https://example.com/b.jpg',
 {url:'javascript:alert(1)'},{url:'data:image/png;base64,anything'},
 {url:'https://user:secret@example.com/c.jpg'},null,'/relative.png','http://example.com/d.jpg'
]});
assert.equal(images.length,2);
assert.equal(images[0].alt,'포스터');
assert.equal(images[1].alt,'모집 안내 안내 이미지 2');
assert.equal(images[1].url,'https://example.com/b.jpg');
assert.deepEqual(noticeImages({title:'포스터 공지',imageUrl:'https://example.com/poster.png'}),[{url:'https://example.com/poster.png',alt:'포스터 공지 안내 이미지 1'}]);
assert.equal(noticeImages({title:'공지',imageUrls:['https://example.com/a.png','https://example.com/a.png','https://example.com/b.png']}).length,2);
assert.deepEqual(noticeImages({images:[],imageUrls:['https://example.com/old.png'],imageUrl:'https://example.com/old.png'}),[],'An explicit empty images array must clear earlier URLs');
assert.deepEqual(noticeImages({imageUrl:'javascript:alert(1)'}),[]);
assert.deepEqual(noticeImages({imageUrl:null}),[]);
console.log('Notice images: ordered HTTPS URLs, fallback descriptions and invalid source rejection passed');
