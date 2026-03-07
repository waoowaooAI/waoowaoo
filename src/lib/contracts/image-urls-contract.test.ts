import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ImageUrlsContractError,
  decodeImageUrlsFromDb,
  decodeImageUrlsStrict,
  encodeImageUrls,
} from './image-urls-contract'

test('encodeImageUrls returns JSON array string', () => {
  const encoded = encodeImageUrls(['a', 'b'])
  assert.equal(encoded, '["a","b"]')
})

test('decodeImageUrlsStrict parses valid JSON array', () => {
  const decoded = decodeImageUrlsStrict('["a","b"]')
  assert.deepEqual(decoded, ['a', 'b'])
})

test('decodeImageUrlsStrict throws on invalid JSON', () => {
  assert.throws(() => decodeImageUrlsStrict('not-json'), ImageUrlsContractError)
})

test('decodeImageUrlsStrict throws on non-array JSON', () => {
  assert.throws(() => decodeImageUrlsStrict('{"a":1}'), ImageUrlsContractError)
})

test('decodeImageUrlsStrict throws on non-string array entry', () => {
  assert.throws(() => decodeImageUrlsStrict('["a",1]'), ImageUrlsContractError)
})

test('decodeImageUrlsFromDb throws on null', () => {
  assert.throws(() => decodeImageUrlsFromDb(null), ImageUrlsContractError)
})
