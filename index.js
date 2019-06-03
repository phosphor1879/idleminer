const spawn = require('cross-spawn');
const system = require('@paulcbetts/system-idle-time');
const args = require('minimist')(process.argv);

let miner = null;
let minTime = 60000;
let minUtil = 25;

async function run(cmd, args) {
  return new Promise((resolve, reject) => {
    let proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code)=>{
      if (code === 0) {
        resolve();
      } else {
        reject();
      }
    });
  })
}

async function pl(gpu, pl) {
  return run("/usr/bin/nvidia-smi", ["-i", String(gpu), "-pl", String(pl)]);
}

async function startMiner() {
  console.log('lowering power level');
  await pl(0, 100);
  console.log('launching miner');
  miner = spawn("/home/keyvan/mining/t-rex", ['-a', 'x16r', '-o', 'stratum+tcp://stratum.icemining.ca:3648', '-u', 'FPMz6eFy4fYn5B4y85GR52LWRjKXbavRde.phoslab', '-p', 'c=PHL'], { stdio: 'inherit' });
  miner.on('close', async ()=>{
    miner = null;
    console.log('resetting power level');
    await pl(0, 180);
  });
  miner.on('error', ()=>{
    miner = null;
    console.log('failed to start miner');
  });
}

async function getUtil(gpu) {
  return new Promise((resolve, reject)=>{
    let proc = spawn('/usr/bin/nvidia-smi', ['--query-gpu=utilization.gpu', '--format=csv']);
    let buf = "";
    proc.stdout.on('data', (data)=> buf+=data.toString());
    proc.on('error', reject);
    proc.on('close', ()=>{
      let lines = buf.split('\n');
      lines.shift(); // drop header line
      resolve(parseInt(lines[gpu]));
    });
  });
}

async function loop() {
  let idleTime = system.getIdleTime();
  if (miner === null && idleTime > minTime) {
    let util = await getUtil(0);
    if (util < minUtil) {
      console.log('utilization is low, starting miner');
      try {
        await startMiner()
      } catch(err) {
        console.log(err);
      }
    }
  } else if (miner !== null && idleTime <= minTime) {
    console.log('killing miner');
    miner.kill();
  }
  setTimeout(loop, 1000);
}

setTimeout(loop, 1000);
