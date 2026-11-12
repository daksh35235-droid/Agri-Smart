const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, {recursive:true});

const states = [
'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
];
const SOURCES = [
 {name:'ICAR — Indian Council of Agricultural Research',type:'Research & advisories',url:'https://icar.gov.in/'},
 {name:'PM-KISAN',type:'Government scheme & farmer services',url:'https://pmkisan.gov.in/'},
 {name:'Ministry of Agriculture & Farmers Welfare',type:'Government agriculture information',url:'https://agriwelfare.gov.in/'},
 {name:'India Meteorological Department',type:'Weather & agrometeorology',url:'https://mausam.imd.gov.in/'},
 {name:'Soil Health Card',type:'Soil testing & nutrient information',url:'https://soilhealth.dac.gov.in/'},
 {name:'e-NAM',type:'Agricultural markets',url:'https://www.enam.gov.in/'},
 {name:'Kisan Suvidha',type:'Farmer services',url:'https://kisansuvidha.gov.in/'},
 {name:'Agricultural Skill Council / Government resources',type:'Training & skills',url:'https://agriculture.gov.in/'}
];

function freshDB(){return {users:[],farms:[],soilTests:[],crops:[],audit:[],sessions:[]};}
function loadDB(){
 if(!fs.existsSync(DB_FILE)){const initial=freshDB();fs.writeFileSync(DB_FILE,JSON.stringify(initial,null,2),{flag:'wx'});return initial;}
 try{const parsed=JSON.parse(fs.readFileSync(DB_FILE,'utf8'));for(const k of ['users','farms','soilTests','crops','audit','sessions'])if(!Array.isArray(parsed[k]))parsed[k]=[];return parsed;}
 catch(e){console.error('FATAL: data/db.json is invalid. It was NOT overwritten. Restore a backup before restarting.',e.message);process.exit(1);}
}
let db=loadDB();
function save(){const tmp=DB_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(tmp,DB_FILE);}

function id(prefix){return prefix+'_'+crypto.randomBytes(7).toString('hex');}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){const hash=crypto.pbkdf2Sync(password,salt,120000,64,'sha512').toString('hex');return {salt,hash};}
function verifyPassword(password,user){const actual=Buffer.from(hashPassword(password,user.salt).hash,'hex');const expected=Buffer.from(user.passwordHash||'','hex');return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
function safeUser(u){return {id:u.id,name:u.name,email:u.email,phone:u.phone,state:u.state,district:u.district,role:u.role,createdAt:u.createdAt};}
function seedAdmin(){
 const email=process.env.ADMIN_EMAIL, password=process.env.ADMIN_PASSWORD;
 if(email&&password&&!db.users.some(u=>u.role==='admin'&&u.email===email.toLowerCase())){
  if(password.length<12)throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  const hp=hashPassword(password);db.users.push({id:id('usr'),name:process.env.ADMIN_NAME||'Agri-Smart Operator',email:email.trim().toLowerCase(),phone:'',state:'',district:'',role:'admin',salt:hp.salt,passwordHash:hp.hash,createdAt:new Date().toISOString()});save();
 }
}
seedAdmin();

const SESSION_TTL=7*24*60*60*1000;
const sessions=new Map((db.sessions||[]).filter(x=>x&&x.token&&x.userId&&Number(x.expiresAt)>Date.now()).map(x=>[x.token,{userId:x.userId,expiresAt:Number(x.expiresAt)}]));
function saveSessions(){db.sessions=[...sessions.entries()].map(([token,x])=>({token,userId:x.userId,expiresAt:x.expiresAt}));save();}
function createSession(userId){const t=token();sessions.set(t,{userId,expiresAt:Date.now()+SESSION_TTL});saveSessions();return t;}
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function parseBody(req){return new Promise((resolve,reject)=>{let b='',done=false;req.on('data',c=>{if(done)return;b+=c;if(b.length>1e6){done=true;reject(Object.assign(new Error('Request body too large'),{status:413}));}});req.on('end',()=>{if(done)return;try{const value=b?JSON.parse(b):{};if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('JSON body must be an object');resolve(value);}catch(e){reject(Object.assign(new Error('Invalid JSON request body'),{status:400}));}});req.on('error',reject);});}
const loginAttempts=new Map(),registerAttempts=new Map();
function clientIp(req){const forwarded=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean);return forwarded.length?forwarded[0]:(req.socket.remoteAddress||'unknown');}
function rateLimited(req,store,limit,windowMs){const key=clientIp(req),now=Date.now(),a=(store.get(key)||[]).filter(t=>now-t<windowMs);if(a.length>=limit){store.set(key,a);return true;}a.push(now);store.set(key,a);return false;}
function isText(v,max=160){return typeof v==='string'&&v.trim().length>0&&v.length<=max;}
function csvCell(v){let x=String(v??'');if(/^[\s]*[=+@\-]/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';}

function token(){return crypto.randomBytes(32).toString('hex');}
function auth(req){const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');const s=sessions.get(t);if(!s)return null;if(s.expiresAt<=Date.now()){sessions.delete(t);saveSessions();return null;}const u=db.users.find(x=>x.id===s.userId);return u?{u,t}:null;}
function audit(actor,action,entity,details=''){db.audit.unshift({id:id('aud'),actorId:actor?.id||'system',actorName:actor?.name||'System',action,entity,details,at:new Date().toISOString()});db.audit=db.audit.slice(0,2000);save();}
function requireAuth(req,res,role){const a=auth(req);if(!a){json(res,401,{error:'Authentication required'});return null;}if(role && a.u.role!==role){json(res,403,{error:'Operator access required'});return null;}return a;}

async function api(req,res){
 const parsed=url.parse(req.url,true); const p=parsed.pathname;
 if(!p.startsWith('/api/')) return false;
 try{
  if(req.method==='POST'&&p==='/api/register'&&rateLimited(req,registerAttempts,5,60*60*1000))return json(res,429,{error:'Too many registration attempts. Please try again later.'});
  if(req.method==='GET'&&p==='/api/states') return json(res,200,{states});
  if(req.method==='GET'&&p==='/api/sources') return json(res,200,{sources:SOURCES});
  if(req.method==='POST'&&p==='/api/register'){
   const b=await parseBody(req); if(!isText(b.name,100)||!isText(b.email,254)||!/^\S+@\S+\.\S+$/.test(b.email)||typeof b.password!=='string'||b.password.length<8||b.password.length>200)return json(res,400,{error:'Enter a valid name, email and password (8–200 characters).'});
   if(db.users.some(u=>u.email.toLowerCase()===b.email.toLowerCase()))return json(res,409,{error:'An account with this email already exists.'});
   const hp=hashPassword(b.password);const u={id:id('usr'),name:b.name.trim(),email:b.email.trim().toLowerCase(),phone:b.phone||'',state:b.state||'',district:b.district||'',role:'farmer',salt:hp.salt,passwordHash:hp.hash,createdAt:new Date().toISOString()};db.users.push(u);save();audit(u,'REGISTER','user',u.email);const t=createSession(u.id);return json(res,201,{token:t,user:safeUser(u)});
  }
  if(req.method==='POST'&&p==='/api/login'){
   if(rateLimited(req,loginAttempts,10,15*60*1000))return json(res,429,{error:'Too many login attempts. Please wait 15 minutes and try again.'});
   const b=await parseBody(req);if(typeof b.email!=='string'||typeof b.password!=='string'||b.email.length>254||b.password.length>200)return json(res,400,{error:'Email and password must be valid text.'});const u=db.users.find(x=>x.email.toLowerCase()===b.email.toLowerCase());if(!u||!verifyPassword(b.password,u))return json(res,401,{error:'Invalid email or password.'});const t=createSession(u.id);audit(u,'LOGIN','session');return json(res,200,{token:t,user:safeUser(u)});
  }
  if(req.method==='POST'&&p==='/api/logout'){const a=auth(req);if(a)audit(a.u,'LOGOUT','session');if(a){sessions.delete(a.t);saveSessions();}return json(res,200,{ok:true});}
  if(req.method==='GET'&&p==='/api/me'){const a=requireAuth(req,res);if(!a)return true;return json(res,200,{user:safeUser(a.u)});}
  if(req.method==='GET'&&p==='/api/dashboard'){
   const a=requireAuth(req,res);if(!a)return true;const mine=a.u.role==='admin'?db.users:db.users.filter(u=>u.id===a.u.id);const uidSet=new Set(mine.map(u=>u.id));
   const farms=db.farms.filter(x=>uidSet.has(x.userId));const soils=db.soilTests.filter(x=>uidSet.has(x.userId));const crops=db.crops.filter(x=>uidSet.has(x.userId));
   return json(res,200,{stats:{farmers:mine.filter(u=>u.role==='farmer').length,farms:farms.length,soilTests:soils.length,crops:crops.length},farms,soilTests:soils,crops});
  }
  if(req.method==='PUT'&&p==='/api/profile'){
   const a=requireAuth(req,res);if(!a)return true;const b=await parseBody(req);if(b.name!==undefined){if(!isText(b.name,100))return json(res,400,{error:'Name must be 1–100 characters.'});a.u.name=b.name.trim();}for(const k of ['phone','state','district'])if(b[k]!==undefined){if(typeof b[k]!=='string'||b[k].length>120)return json(res,400,{error:`Invalid ${k}.`});a.u[k]=b[k];}save();audit(a.u,'UPDATE','profile');return json(res,200,{user:safeUser(a.u)});
  }
  if(req.method==='POST'&&p==='/api/farms'){
   const a=requireAuth(req,res);if(!a)return true;const b=await parseBody(req);if(!isText(b.name,120)||!isText(b.state,100)||!Number.isFinite(Number(b.area))||Number(b.area)<=0||Number(b.area)>10000000)return json(res,400,{error:'Enter a farm name, state and a positive valid area.'});const f={id:id('farm'),userId:a.u.id,name:b.name,state:b.state,district:b.district||'',village:b.village||'',area:Number(b.area),unit:b.unit||'acre',soilType:b.soilType||'',irrigation:b.irrigation||'',notes:b.notes||'',createdAt:new Date().toISOString()};db.farms.push(f);save();audit(a.u,'CREATE','farm',f.name);return json(res,201,{farm:f});
  }
  if(req.method==='POST'&&p==='/api/soil-tests'){
   const a=requireAuth(req,res);if(!a)return true;const b=await parseBody(req);if(b.farmId&&!db.farms.some(f=>f.id===b.farmId&&f.userId===a.u.id))return json(res,403,{error:'You can only attach a soil test to your own farm.'});if(b.ph!==undefined&&b.ph!==''&&(!Number.isFinite(Number(b.ph))||Number(b.ph)<0||Number(b.ph)>14))return json(res,400,{error:'Soil pH must be between 0 and 14.'});const s={id:id('soil'),userId:a.u.id,farmId:b.farmId||'',date:b.date||new Date().toISOString().slice(0,10),ph:b.ph===''?null:Number(b.ph),nitrogen:b.nitrogen===''?null:Number(b.nitrogen),phosphorus:b.phosphorus===''?null:Number(b.phosphorus),potassium:b.potassium===''?null:Number(b.potassium),organicCarbon:b.organicCarbon===''?null:Number(b.organicCarbon),notes:b.notes||'',createdAt:new Date().toISOString()};db.soilTests.push(s);save();audit(a.u,'CREATE','soil_test',s.id);return json(res,201,{soilTest:s});
  }
  if(req.method==='DELETE'&&p.startsWith('/api/soil-tests/')){
   const a=requireAuth(req,res);if(!a)return true;const testId=decodeURIComponent(p.slice('/api/soil-tests/'.length));const index=db.soilTests.findIndex(x=>x.id===testId&&x.userId===a.u.id);if(index<0)return json(res,404,{error:'Soil test not found.'});const removed=db.soilTests.splice(index,1)[0];save();audit(a.u,'DELETE','soil_test',removed.id);return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&p==='/api/crops'){
   const a=requireAuth(req,res);if(!a)return true;const b=await parseBody(req);if(b.farmId&&!db.farms.some(f=>f.id===b.farmId&&f.userId===a.u.id))return json(res,403,{error:'You can only attach a crop record to your own farm.'});const c={id:id('crop'),userId:a.u.id,farmId:b.farmId||'',season:b.season||'',crop:b.crop||'',year:Number(b.year)||new Date().getFullYear(),area:Number(b.area)||0,yieldAmount:Number(b.yieldAmount)||0,yieldUnit:b.yieldUnit||'quintal',revenue:Number(b.revenue)||0,cost:Number(b.cost)||0,notes:b.notes||'',createdAt:new Date().toISOString()};if(!c.crop)return json(res,400,{error:'Crop is required.'});db.crops.push(c);save();audit(a.u,'CREATE','crop',c.crop);return json(res,201,{crop:c});
  }
  if(req.method==='GET'&&p==='/api/admin/users'){
   const a=requireAuth(req,res,'admin');if(!a)return true;return json(res,200,{users:db.users.map(safeUser)});
  }
  if(req.method==='GET'&&p==='/api/admin/audit'){
   const a=requireAuth(req,res,'admin');if(!a)return true;return json(res,200,{audit:db.audit.slice(0,500)});
  }
  if(req.method==='GET'&&p==='/api/admin/export'){
   const a=requireAuth(req,res,'admin');if(!a)return true;const type=parsed.query.type||'users';let rows=[];if(type==='users')rows=db.users.map(u=>({id:u.id,name:u.name,email:u.email,phone:u.phone,state:u.state,district:u.district,role:u.role,createdAt:u.createdAt}));if(type==='farms')rows=db.farms;if(type==='soil')rows=db.soilTests;if(type==='crops')rows=db.crops;const keys=[...new Set(rows.flatMap(o=>Object.keys(o)))];const esc=csvCell;const csv=[keys.map(esc).join(','),...rows.map(r=>keys.map(k=>esc(r[k])).join(','))].join('\n');res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=agri-smart-${type}.csv`});return res.end(csv);
  }
  json(res,404,{error:'API endpoint not found'});return true;
 }catch(e){if(e.status){json(res,e.status,{error:e.message});return true;}console.error(e);json(res,500,{error:'Server error'});return true;}
}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',"default-src 'self' https: data:; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");const reqPath=new URL(req.url,'http://localhost').pathname;if(reqPath==='/health'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,service:'agri-smart'}));}if(req.headers['x-forwarded-proto']==='https'||req.socket.encrypted)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');if(reqPath.startsWith('/api/')){await api(req,res);return;}let pathname=reqPath;if(pathname==='/')pathname='/index.html';const file=path.normalize(path.join(PUBLIC,pathname));if(file!==PUBLIC&&!file.startsWith(PUBLIC+path.sep))return json(res,403,{error:'Forbidden'});fs.readFile(file,(e,data)=>{if(e){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=86400'};if(req.headers['accept-encoding']?.includes('gzip')&&data.length>1024){zlib.gzip(data,(err,compressed)=>{if(err){res.writeHead(200,headers);return res.end(data);}res.writeHead(200,{...headers,'Content-Encoding':'gzip','Vary':'Accept-Encoding'});res.end(compressed);});}else{res.writeHead(200,headers);res.end(data);}});});
// Local development: if port 3000 is already occupied, try the next available port.
// Hosted platforms (for example Render) provide PORT; use that exact port.
const requestedPort = Number(PORT) || 3000;
const allowLocalFallback = !process.env.PORT;
function startServer(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && allowLocalFallback && port < requestedPort + 20) {
      console.warn(`Port ${port} is already in use. Trying port ${port + 1}...`);
      startServer(port + 1);
      return;
    }
    console.error(`Could not start Agri-Smart on port ${port}:`, err.message);
    if (err.code === 'EADDRINUSE') {
      console.error('Stop the other server using this port, or set a different PORT environment variable for local development.');
    }
    process.exitCode = 1;
  });
  server.listen(port, () => {
    console.log(`Agri-Smart running at http://localhost:${port}`);
  });
}
startServer(requestedPort);
