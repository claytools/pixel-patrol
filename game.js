(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;

  const ui = {
    score:$('score'), level:$('level'), lives:$('lives'), power:$('power'),
    start:$('startOverlay'), upgrades:$('upgradeOverlay'), over:$('gameOverOverlay'), levelCard:$('levelOverlay'),
    startBtn:$('startButton'), continueBtn:$('continueButton'), againBtn:$('playAgainButton'), saveBtn:$('saveScoreButton'), fullscreenBtn:$('fullscreenButton'),
    initials:$('initials'), final:$('finalScore'), board:$('leaderboard'), upgradeScore:$('upgradeScore'), upgradeChoices:$('upgradeChoices'),
    moveControls:$('moveControls'), touchLeft:$('touchLeft'), touchRight:$('touchRight'), touchFire:$('touchFire')
  };

  const keys = new Set(), shots=[], enemyShots=[], invaders=[], particles=[], stars=[];
  const player = { x:W/2, y:H-56, w:44, h:26, speed:340, invuln:0 };
  let playing=false, paused=false, shopping=false, score=1000, lives=10, level=1, last=0;
  let direction=1, enemySpeed=32, enemyFire=0, fireCooldown=0, bonus=null, bonusTimer=6, flash=0;
  let upgrades={fireRate:0,bulletSpeed:0,spread:0,power:0};

  const monsterDefs = {
    yellow:{name:'Yellow',meters:1,points:100,scale:.68,hp:1,color:'#ffe12c'},
    orange:{name:'Orange',meters:3,points:150,scale:.92,hp:1,color:'#ff8a22'},
    purple:{name:'Purple',meters:5,points:250,scale:1.18,hp:2,color:'#9b4de3'},
    green:{name:'Green',meters:7,points:450,scale:1.48,hp:3,color:'#36b36c'}
  };

  const upgradeDefs=[
    {key:'fireRate',name:'Rapid Fire',desc:'Shoot more often.',base:100,step:125,max:10},
    {key:'bulletSpeed',name:'Hyper Bolts',desc:'Shots travel faster.',base:100,step:150,max:10},
    {key:'spread',name:'Multi-Shot',desc:'Adds more angled side shots as it levels up.',base:200,step:250,max:10},
    {key:'power',name:'Plasma Power',desc:'Stronger shots do more damage and punch through enemies.',base:250,step:300,max:10}
  ];

  const upgradeCost = def => def.base + def.step * upgrades[def.key];
  const hud = () => { ui.score.textContent=Math.floor(score); ui.level.textContent=level; ui.lives.textContent=lives; ui.power.textContent=1+upgrades.power; };

  function makeStars(){
    let seed=1337; const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<125;i++) stars.push({x:rnd()*W,y:rnd()*H,s:rnd()<.84?1:2,a:.35+rnd()*.65});
  }

  function monsterForRow(row, rows){
    const f = rows<=1 ? 0 : row/(rows-1);
    if(f<.16) return monsterDefs.green;
    if(f<.38) return monsterDefs.purple;
    if(f<.68) return monsterDefs.orange;
    return monsterDefs.yellow;
  }

  function showLevel(){
    ui.levelCard.textContent=`LEVEL ${level}`; ui.levelCard.classList.add('shown');
    setTimeout(()=>ui.levelCard.classList.remove('shown'),900);
  }

  function wave(){
    invaders.length=shots.length=enemyShots.length=0; direction=1; enemySpeed=32+(level-1)*8;
    const rows=Math.min(5+Math.floor((level-1)/3),7), cols=Math.min(9+Math.floor((level-1)/2),12);
    const gapX=72, gapY=62, startX=W/2-((cols-1)*gapX)/2;
    for(let r=0;r<rows;r++){
      const m=monsterForRow(r,rows);
      for(let c=0;c<cols;c++) invaders.push({
        x:startX+c*gapX,y:86+r*gapY,w:42*m.scale,h:30*m.scale,row:r,col:c,
        kind:Object.keys(monsterDefs).find(k=>monsterDefs[k]===m),points:m.points,color:m.color,alive:true,hp:m.hp,maxHp:m.hp,meters:m.meters
      });
    }
    shopping=false; ui.upgrades.classList.remove('shown'); showLevel();
  }

  function reset(){
    score=1000;lives=10;level=1;paused=false;shopping=false;upgrades={fireRate:0,bulletSpeed:0,spread:0,power:0};
    player.x=W/2;player.invuln=0;particles.length=0;bonus=null;bonusTimer=6;wave();hud();
  }
  function start(){reset();playing=true;ui.start.classList.remove('shown');ui.over.classList.remove('shown');ui.upgrades.classList.remove('shown');last=performance.now();}
  function gameOver(){playing=false;shopping=false;ui.final.textContent=Math.floor(score);ui.initials.value='';ui.over.classList.add('shown');setTimeout(()=>ui.initials.focus(),50);}

  const overlap=(a,b)=>a.x-a.w/2<b.x+b.w/2&&a.x+a.w/2>b.x-b.w/2&&a.y-a.h/2<b.y+b.h/2&&a.y+a.h/2>b.y-b.h/2;
  function burst(x,y,color,count=12){for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=45+Math.random()*170;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.45,color,size:2+Math.random()*3});}}

  function fire(){
    if(!playing||paused||shopping||fireCooldown>0)return;
    const speed=560+upgrades.bulletSpeed*75, damage=1+upgrades.power, pierce=Math.floor(upgrades.power/2);
    const add=(vx=0,offset=0)=>shots.push({x:player.x+offset,y:player.y-24,w:4,h:14,vx,vy:-speed,damage,pierce});
    add(); const pairs=Math.min(5,Math.ceil(upgrades.spread/2));
    for(let p=1;p<=pairs;p++){const vx=55+p*48,off=3+p*4;add(-vx,-off);add(vx,off);}
    if(upgrades.spread>0&&upgrades.spread%2===1)for(const s of shots.slice(-1-pairs*2))s.vx*=1.12;
    fireCooldown=Math.max(.04,.22-upgrades.fireRate*.018);
  }

  function shooter(){
    const front=new Map();
    for(const i of invaders)if(i.alive){const cur=front.get(i.col);if(!cur||i.y>cur.y)front.set(i.col,i);}
    const arr=[...front.values()];return arr[Math.floor(Math.random()*arr.length)];
  }
  function hitPlayer(){if(player.invuln>0)return;lives--;player.invuln=1.6;flash=.18;burst(player.x,player.y,'#fff',24);hud();if(lives<=0)gameOver();}

  function openUpgradeBay(){shopping=true;shots.length=0;enemyShots.length=0;score+=150*(level+1);level++;hud();renderUpgrades();ui.upgrades.classList.add('shown');}
  function makeProgress(current,max=10,life=false){const w=document.createElement('div');w.className='upgrade-progress';w.setAttribute('aria-label',`${current} of ${max} unlocked`);for(let i=1;i<=max;i++){const p=document.createElement('span');p.className='upgrade-pip'+(i<=current?' filled':'')+(life?' life':'');p.title=`Level ${i}`;w.appendChild(p);}return w;}

  function renderUpgrades(){
    ui.upgradeScore.textContent=Math.floor(score);ui.upgradeChoices.innerHTML='';
    const lifeCost=500, lifeMax=lives>=10;
    const lifeCard=document.createElement('div');lifeCard.className='upgrade-card';
    const lh=document.createElement('h3');lh.textContent=`Extra Life  ${lives}/10`;
    const lp=document.createElement('p');lp.textContent='Repair one lost life. Your ship can never hold more than 10 lives.';
    const lc=document.createElement('p');lc.className='cost';lc.textContent=lifeMax?'LIVES FULL':`COST: ${lifeCost} PTS`;
    const lb=document.createElement('button');lb.type='button';lb.textContent=lifeMax?'MAX LIVES':'BUY +1 LIFE';lb.disabled=lifeMax||score<lifeCost;
    lb.addEventListener('click',()=>{if(lives>=10||score<lifeCost)return;score-=lifeCost;lives=Math.min(10,lives+1);hud();renderUpgrades();});
    lifeCard.append(lh,makeProgress(lives,10,true),lp,lc,lb);ui.upgradeChoices.appendChild(lifeCard);

    for(const def of upgradeDefs){
      const lvl=upgrades[def.key],maxed=lvl>=def.max,cost=upgradeCost(def),card=document.createElement('div');card.className='upgrade-card';
      const h=document.createElement('h3');h.textContent=`${def.name}  LV ${lvl}/${def.max}`;
      const p=document.createElement('p');p.textContent=def.desc;const c=document.createElement('p');c.className='cost';c.textContent=maxed?'MAXED':`COST: ${cost} PTS`;
      const b=document.createElement('button');b.type='button';b.textContent=maxed?'MAXED OUT':'BUY UPGRADE';b.disabled=maxed||score<cost;
      b.addEventListener('click',()=>{const live=upgradeCost(def);if(upgrades[def.key]>=def.max||score<live)return;score-=live;upgrades[def.key]++;hud();renderUpgrades();});
      card.append(h,makeProgress(lvl,def.max),p,c,b);ui.upgradeChoices.appendChild(card);
    }
  }
  function continueAfterUpgrade(){if(shopping)wave();}

  function update(dt){
    if(!playing||paused||shopping)return;
    fireCooldown=Math.max(0,fireCooldown-dt);player.invuln=Math.max(0,player.invuln-dt);flash=Math.max(0,flash-dt);
    if(keys.has('ArrowLeft')||keys.has('KeyA'))player.x-=player.speed*dt;if(keys.has('ArrowRight')||keys.has('KeyD'))player.x+=player.speed*dt;
    player.x=Math.max(30,Math.min(W-30,player.x));
    for(const s of shots){s.y+=s.vy*dt;s.x+=(s.vx||0)*dt;}for(const s of enemyShots)s.y+=s.vy*dt;

    for(let n=shots.length-1;n>=0;n--){
      const shot=shots[n];let used=shot.y<-20||shot.x<-30||shot.x>W+30;
      if(bonus&&!used&&overlap(shot,bonus)){score+=1000;burst(bonus.x,bonus.y,'#ffd966',28);bonus=null;if(shot.pierce>0)shot.pierce--;else used=true;hud();}
      if(!used)for(const i of invaders)if(i.alive&&overlap(shot,i)){
        i.hp-=shot.damage;burst(shot.x,shot.y,i.color,6);
        if(i.hp<=0){i.alive=false;score+=i.points;burst(i.x,i.y,i.color,i.kind==='green'?24:i.kind==='purple'?18:12);hud();}
        if(shot.pierce>0)shot.pierce--;else used=true;break;
      }
      if(used)shots.splice(n,1);
    }

    for(let n=enemyShots.length-1;n>=0;n--){const s=enemyShots[n];if(overlap(s,player)){enemyShots.splice(n,1);hitPlayer();}else if(s.y>H+30)enemyShots.splice(n,1);}
    const alive=invaders.filter(i=>i.alive);
    if(alive.length){
      let minX=Infinity,maxX=-Infinity;for(const i of alive){i.x+=direction*enemySpeed*dt;minX=Math.min(minX,i.x-i.w/2);maxX=Math.max(maxX,i.x+i.w/2);}
      if((direction>0&&maxX>W-24)||(direction<0&&minX<24)){direction*=-1;for(const i of alive)i.y+=18;}
      if(alive.some(i=>i.y+i.h/2>=player.y-12)){lives=0;hud();gameOver();}
    }else if(invaders.length){invaders.length=0;openUpgradeBay();}

    enemyFire-=dt;if(enemyFire<=0){const s=shooter();if(s)enemyShots.push({x:s.x,y:s.y+s.h/2,w:5,h:14,vy:195+level*16});enemyFire=Math.max(.25,1.05-level*.07)*(.65+Math.random()*.7);}
    bonusTimer-=dt;if(!bonus&&bonusTimer<=0){const dir=Math.random()<.5?1:-1;bonus={x:dir>0?-40:W+40,y:54,w:54,h:22,vx:dir*(105+level*5)};bonusTimer=9+Math.random()*9;}
    if(bonus){bonus.x+=bonus.vx*dt;if(bonus.x<-80||bonus.x>W+80)bonus=null;}
    for(let n=particles.length-1;n>=0;n--){const p=particles[n];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;p.life-=dt;if(p.life<=0)particles.splice(n,1);}
  }

  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function drawPlayer(){if(player.invuln>0&&Math.floor(player.invuln*12)%2===0)return;const x=Math.round(player.x),y=Math.round(player.y);rect(x-20,y+4,40,8,'#d9f7ff');rect(x-14,y-4,28,9,'#d9f7ff');rect(x-5,y-13,10,10,'#72f2cf');rect(x-2,y-19,4,7,'#72f2cf');if(upgrades.spread>0){rect(x-27,y+2,6,10,'#ffd966');rect(x+21,y+2,6,10,'#ffd966');}if(upgrades.power>1)rect(x-9,y-9,18,4,'#ff7edb');}

  function paintPattern(i,pattern){
    const cols=Math.max(...pattern.map(r=>r.length)), rows=pattern.length;
    const u=Math.max(2,Math.round(i.w/cols)); const x0=Math.round(i.x-(cols*u)/2), y0=Math.round(i.y-(rows*u)/2);
    ctx.fillStyle=i.color; pattern.forEach((row,r)=>[...row].forEach((v,c)=>{if(v==='1')ctx.fillRect(x0+c*u,y0+r*u,u,u);}));
  }
  function drawInvader(i,t){
    const bob=Math.floor(t*3+i.row+i.col)%2;
    const patterns={
      yellow:['00111100','01111110','11111111','11011011','11111111',bob?'01000010':'00100100'],
      orange:['0011111100','0111111110','1111111111','1101101011','1111111111','1010000101',bob?'0101001010':'0010110100'],
      purple:['000111000','001111100','111111111','111101111','111111111','001111100','001111100',bob?'010101010':'001000100'],
      green:['000100000','001110000','111111111','101111101','111111111','110111011','111111111','011111110',bob?'010000010':'001010100']
    };
    paintPattern(i,patterns[i.kind]);
    if(i.kind==='green'){rect(i.x-i.w*.16,i.y-i.h*.07,i.w*.09,i.h*.09,'#ffe12c');rect(i.x+i.w*.07,i.y-i.h*.07,i.w*.09,i.h*.09,'#ffe12c');}
    if(i.hp<i.maxHp)rect(i.x-12,i.y+i.h/2+5,24*(i.hp/i.maxHp),2,'#fff');
  }

  function draw(t){
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    for(const s of stars){ctx.globalAlpha=s.a*(.75+.25*Math.sin(t*1.4+s.x));rect(s.x,s.y,s.s,s.s,'#fff');}ctx.globalAlpha=1;
    ctx.strokeStyle='#1a3a38';ctx.lineWidth=2;ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(0,H-28);ctx.lineTo(W,H-28);ctx.stroke();ctx.setLineDash([]);
    for(const i of invaders)if(i.alive)drawInvader(i,t);
    if(bonus){const x=Math.round(bonus.x),y=Math.round(bonus.y);rect(x-24,y,48,7,'#ffd966');rect(x-17,y-7,34,7,'#ff9d5c');rect(x-8,y-12,16,5,'#fff');rect(x-18,y+7,7,5,'#ff7edb');rect(x+11,y+7,7,5,'#ff7edb');}
    for(const s of shots)rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h,upgrades.power>0?'#7fffd4':'#d9fff7');
    for(const s of enemyShots){rect(s.x-s.w/2,s.y-s.h/2,s.w,s.h,'#ff6f91');rect(s.x-1,s.y-5,2,4,'#fff');}
    drawPlayer();for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*2.5);rect(p.x,p.y,p.size,p.size,p.color);}ctx.globalAlpha=1;
    if(paused&&playing&&!shopping){ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 44px monospace';ctx.fillText('PAUSED',W/2,H/2);}
    if(flash>0){ctx.fillStyle=`rgba(255,255,255,${flash*1.8})`;ctx.fillRect(0,0,W,H);}
  }
  function loop(now){const dt=Math.min(.034,(now-last)/1000||0);last=now;update(dt);draw(now/1000);requestAnimationFrame(loop);}

  function loadScores(){try{return JSON.parse(localStorage.getItem('pixel-invaders-scores')||localStorage.getItem('pixel-patrol-scores')||'[]');}catch{return[];}}
  function renderScores(){const scores=loadScores().sort((a,b)=>b.score-a.score).slice(0,8);ui.board.innerHTML='';if(!scores.length){const li=document.createElement('li');li.textContent='NO SCORES YET';ui.board.appendChild(li);return;}for(const e of scores){const li=document.createElement('li'),span=document.createElement('span');li.append(document.createTextNode(e.initials));span.textContent=e.score;li.appendChild(span);ui.board.appendChild(li);}}
  function saveScore(){const initials=ui.initials.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3)||'???';const scores=loadScores();scores.push({initials,score:Math.floor(score),at:Date.now()});scores.sort((a,b)=>b.score-a.score);localStorage.setItem('pixel-invaders-scores',JSON.stringify(scores.slice(0,20)));renderScores();ui.saveBtn.textContent='SAVED!';setTimeout(()=>ui.saveBtn.textContent='SAVE SCORE',900);}

  async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{document.body.classList.toggle('fullscreen-mode');}}
  function syncFullscreen(){const full=!!document.fullscreenElement;document.body.classList.toggle('fullscreen-mode',full);ui.fullscreenBtn.textContent=full?'EXIT FULL SCREEN':'FULL SCREEN';}

  addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space')fire();if(e.code==='KeyP'&&playing&&!shopping)paused=!paused;if(e.code==='KeyR')start();if(e.code==='KeyF')toggleFullscreen();},{passive:false});
  addEventListener('keyup',e=>keys.delete(e.code));document.addEventListener('fullscreenchange',syncFullscreen);

  const touchFirePointers=new Set();
  function setTouchDirection(dir){keys.delete('ArrowLeft');keys.delete('ArrowRight');ui.touchLeft.classList.remove('active');ui.touchRight.classList.remove('active');if(dir==='left'){keys.add('ArrowLeft');ui.touchLeft.classList.add('active');}else if(dir==='right'){keys.add('ArrowRight');ui.touchRight.classList.add('active');}}
  const steerPointers=new Map();
  function directionFromPointer(e){const r=ui.moveControls.getBoundingClientRect();return e.clientX<r.left+r.width/2?'left':'right';}
  if(ui.moveControls){
    ui.moveControls.addEventListener('pointerdown',e=>{e.preventDefault();const d=directionFromPointer(e);steerPointers.set(e.pointerId,d);try{ui.moveControls.setPointerCapture(e.pointerId);}catch{}setTouchDirection(d);},{passive:false});
    ui.moveControls.addEventListener('pointermove',e=>{if(!steerPointers.has(e.pointerId))return;e.preventDefault();const d=directionFromPointer(e);steerPointers.set(e.pointerId,d);setTouchDirection(d);},{passive:false});
    const release=e=>{steerPointers.delete(e.pointerId);if(!steerPointers.size)setTouchDirection(null);else setTouchDirection([...steerPointers.values()].at(-1));};
    ui.moveControls.addEventListener('pointerup',release);ui.moveControls.addEventListener('pointercancel',release);ui.moveControls.addEventListener('lostpointercapture',release);
  }
  if(ui.touchFire){
    const release=e=>{touchFirePointers.delete(e.pointerId);if(!touchFirePointers.size)ui.touchFire.classList.remove('active');};
    ui.touchFire.addEventListener('pointerdown',e=>{e.preventDefault();touchFirePointers.add(e.pointerId);ui.touchFire.classList.add('active');try{ui.touchFire.setPointerCapture(e.pointerId);}catch{}fire();},{passive:false});
    ui.touchFire.addEventListener('pointerup',release);ui.touchFire.addEventListener('pointercancel',release);ui.touchFire.addEventListener('lostpointercapture',release);
  }
  setInterval(()=>{if(touchFirePointers.size)fire();},25);

  ui.startBtn.addEventListener('click',start);ui.againBtn.addEventListener('click',start);ui.saveBtn.addEventListener('click',saveScore);ui.continueBtn.addEventListener('click',continueAfterUpgrade);ui.fullscreenBtn.addEventListener('click',toggleFullscreen);
  ui.initials.addEventListener('input',()=>ui.initials.value=ui.initials.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3));

  makeStars();renderScores();hud();requestAnimationFrame(loop);
})();
