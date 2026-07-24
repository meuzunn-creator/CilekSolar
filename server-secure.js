const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Session yapılandırması
app.use(session({
  secret: 'solar-scada-secret-key-2024', // Değiştir!
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // localhost için false, HTTPS için true
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 saat
  }
}));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================
// KULLANICI ADI VE ŞİFRE (GÜVENLİK)
// ============================================
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'sifre123'; // Değiştir!

// Login sayfası
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Solar SCADA - Giriş</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .login-box {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          width: 90%;
          max-width: 400px;
        }
        h1 {
          text-align: center;
          margin-bottom: 30px;
          color: #333;
          font-size: 24px;
        }
        .form-group {
          margin-bottom: 20px;
        }
        label {
          display: block;
          margin-bottom: 8px;
          color: #666;
          font-weight: 600;
          font-size: 14px;
        }
        input {
          width: 100%;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
        }
        input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 10px;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(102, 126, 234, 0.3);
        }
        .error {
          background: #fff5f5;
          color: #c53030;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          border: 1px solid #feb2b2;
          font-size: 13px;
        }
        .info {
          text-align: center;
          margin-top: 20px;
          color: #999;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>☀️ Solar SCADA</h1>
        ${req.query.error ? '<div class="error">❌ Kullanıcı adı veya şifre yanlış</div>' : ''}
        <form method="POST" action="/login">
          <div class="form-group">
            <label>Kullanıcı Adı</label>
            <input type="text" name="username" required autofocus>
          </div>
          <div class="form-group">
            <label>Şifre</label>
            <input type="password" name="password" required>
          </div>
          <button type="submit">Giriş Yap</button>
        </form>
        <div class="info">
          Demo: admin / sifre123
        </div>
      </div>
    </body>
    </html>
  `);
});

// Login işlemi
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.authenticated = true;
    req.session.user = username;
    res.redirect('/dashboard.html');
  } else {
    res.redirect('/login?error=true');
  }
});

// Çıkış
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.status(401).redirect('/login');
  }
};

// Dashboard'a koruma ekle
app.get('/dashboard.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ============================================
// JANITZA VERİSİ PROXY
// ============================================
app.get('/api/janitza/:device', requireAuth, async (req, res) => {
  const { device } = req.params;
  const { params } = req.query;
  
  const devices = {
    '1': '188.38.46.209:40080',
    '2': '188.38.46.209:40081'
  };

  if (!devices[device]) {
    return res.status(400).json({ error: 'Geçersiz cihaz ID' });
  }

  try {
    const url = `http://${devices[device]}/json.do?${params}&time=${Date.now()}`;
    console.log(`📡 [${req.session.user}] Janitza ${device}: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error(`❌ Janitza ${device} hatası:`, error.message);
    res.status(500).json({ 
      error: `Janitza ${device} bağlanamadı`,
      details: error.message 
    });
  }
});

// ============================================
// OPEN-METEO VERİSİ PROXY
// ============================================
app.get('/api/meteo', requireAuth, async (req, res) => {
  const { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Enlem ve boylam gerekli' });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=global_horizontal_irradiance,direct_normal_irradiance,diffuse_radiation_shortwave,temperature_2m&timezone=auto&current=temperature_2m,weather_code`;
    
    console.log(`🌤️  [${req.session.user}] Open-Meteo`);
    const response = await axios.get(url, { timeout: 5000 });
    
    res.json(response.data);
  } catch (error) {
    console.error('❌ Open-Meteo hatası:', error.message);
    res.status(500).json({ 
      error: 'Open-Meteo bağlanamadı',
      details: error.message 
    });
  }
});

// ============================================
// TEST ENDPOİNTLERİ
// ============================================
app.get('/api/test/:device', requireAuth, async (req, res) => {
  const { device } = req.params;
  const devices = {
    '1': '188.38.46.209:40080',
    '2': '188.38.46.209:40081'
  };

  if (!devices[device]) {
    return res.status(400).json({ error: 'Geçersiz cihaz ID' });
  }

  try {
    const url = `http://${devices[device]}/json.do?_P_SUM,_WH[4]&time=${Date.now()}`;
    console.log(`🧪 [${req.session.user}] Test cihaz ${device}`);
    
    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'Accept': 'application/json' }
    });
    
    res.json({
      status: 'Bağlı ✅',
      device: device,
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'Bağlanamadı ❌',
      device: device,
      error: error.message
    });
  }
});

// ============================================
// STATUS ENDPOINT
// ============================================
app.get('/api/status', requireAuth, (req, res) => {
  res.json({
    server: 'online',
    user: req.session.user,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// SERVER BAŞLAT
// ============================================
app.listen(PORT, () => {
  console.log(`\n✅ Server http://localhost:${PORT} adresinde çalışıyor`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/login`);
  console.log(`🔐 Güvenlik: Aktif (Kullanıcı: ${ADMIN_USER})`);
  console.log(`🧪 Test: http://localhost:${PORT}/api/test/1\n`);
});
