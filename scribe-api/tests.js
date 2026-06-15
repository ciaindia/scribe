const assert = require('assert');

const PORT = process.env.PORT || 8000;
const baseUrl = `http://localhost:${PORT}`;

async function runTests() {
  console.log(`Starting tests against running server at ${baseUrl}...`);

  try {
    // 1. Test GET /api/health
    console.log('Testing /api/health...');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log('✓ Health check passed');

    // 2. Test POST /api/reindex for Nmail
    console.log('Testing reindexing for Nmail...');
    const reindexRes = await fetch(`${baseUrl}/api/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application: 'nmail' })
    });
    assert.strictEqual(reindexRes.status, 200);
    const reindexData = await reindexRes.json();
    assert.strictEqual(reindexData.status, 'success');
    assert.ok(reindexData.filesIndexed >= 2);
    console.log(`✓ Reindexing Nmail passed (${reindexData.filesIndexed} files indexed)`);

    // 3. Test POST /api/chat for Nmail
    console.log('Testing chat query for "Watchdog" on Nmail...');
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application: 'nmail',
        sessionId: 'test_session_123',
        question: 'Where can I see Watchdog?'
      })
    });
    assert.strictEqual(chatRes.status, 200);
    const chatData = await chatRes.json();
    assert.ok(chatData.answer.includes('Watchdog'));
    assert.strictEqual(chatData.url, '/watchdog');
    console.log('✓ Chat query for Watchdog passed');

    // 4. Test POST /api/chat for EmaCloud
    console.log('Testing reindexing and chat query for EmaCloud...');
    await fetch(`${baseUrl}/api/reindex`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application: 'emacloud' })
    });

    const emaChatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application: 'emacloud',
        sessionId: 'test_session_456',
        question: 'How to build email campaigns?'
      })
    });
    assert.strictEqual(emaChatRes.status, 200);
    const emaChatData = await emaChatRes.json();
    assert.ok(emaChatData.answer.includes('Campaigns'));
    assert.strictEqual(emaChatData.url, '/campaigns');
    console.log('✓ EmaCloud campaigns query passed');

    // 5. Test GET /api/session
    console.log('Testing GET /api/session...');
    const historyRes = await fetch(`${baseUrl}/api/session?application=emacloud&sessionId=test_session_456`);
    assert.strictEqual(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.ok(Array.isArray(historyData));
    assert.ok(historyData.length >= 2); // Should have user question and assistant answer
    assert.strictEqual(historyData[0].sender, 'user');
    assert.strictEqual(historyData[0].message, 'How to build email campaigns?');
    console.log('✓ GET session history passed');

    console.log('\nALL TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

runTests();
