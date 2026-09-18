const http = require('http');

const postData = JSON.stringify({
  email: 'hs1@yopmail.com', // Assuming this exists from previous tests or I can use another
  password: 'password123'
});

const req = http.request('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  
  http.get('http://localhost:3000/student/assignments', {
    headers: { 'Cookie': cookie }
  }, (res2) => {
    let data = '';
    res2.on('data', chunk => data += chunk);
    res2.on('end', () => {
      console.log('STATUS:', res2.statusCode);
      // Search for error stack in html
      const match = data.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
      if (match) console.log(match[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
      else console.log(data.substring(0, 500));
    });
  });
});

req.write(postData);
req.end();
