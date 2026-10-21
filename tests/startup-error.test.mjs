import test from 'node:test'
import assert from 'node:assert/strict'
import { isModuleLoadError, startupErrorMessage } from '../src/utils/startupError.js'

test('module MIME and stale chunk failures request reload without storage cleanup', () => {
  for (const message of ["'text/html' is not a valid JavaScript MIME type.", 'Failed to fetch dynamically imported module: /assets/App-old.js', 'Importing a module script failed.']) {
    const error = new Error(message)
    assert.equal(isModuleLoadError(error), true)
    assert.match(startupErrorMessage(error), /重新整理載入最新版/)
    assert.doesNotMatch(startupErrorMessage(error), /請恢復.*儲存空間/)
  }
})
test('persistence recovery failures retain their diagnostic and recovery instruction', () => {
  const error = new Error('展示更新中斷；請恢復儲存空間後重新開啟本頁')
  assert.equal(isModuleLoadError(error), false)
  assert.match(startupErrorMessage(error), /展示更新中斷/)
  assert.match(startupErrorMessage(error), /儲存空間/)
})
