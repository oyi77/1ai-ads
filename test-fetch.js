async function run() {
  try {
    const url = 'http://localhost:20128/v1/models';
    const apiKey = 'sk-f0c1ddf471008e76-2eede9-78bb94ff';
    const headers = { 'Authorization': `Bearer ${apiKey}` };
    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Body snippet:', text.substring(0, 100));
  } catch (e) {
    console.error(e);
  }
}
run();
