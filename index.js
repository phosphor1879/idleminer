const spawn = require('cross-spawn');
const system = require('@paulcbetts/system-idle-time');
const path = require('path');
const args = require('minimist')(process.argv);

let brand = args.brand;
let miner = null;
let minTime = parseInt(args.time) * 1000;
let minUtil = 25;

console.log(args);

if (brand !== "amd" && brand !== "nvidia") {
  throw new Error('brand must be one of nvidia or amd');
}
if (args.time < 1) {
  console.warn("WARNING: time might be too low")
}

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
  if (args.pl === false) {
    console.warn("WARNING: NOT ADJUSTING POWERLEVEL");
  } else {
    return run("/usr/bin/nvidia-smi", ["-i", String(gpu), "-pl", String(pl)]);
  }
}

async function startMiner() {
  console.log('lowering power level');
  await pl(0, 100);
  console.log('launching miner');
  let minerCmd, minerArgs;
  if (brand === "amd") {
    minerCmd = path.join(__dirname, "wildrig.exe")
    minerArgs = [
      '--algo', 'x16r',
      '--opencl-threads', '2', '--opencl-launch', '20x64',
      '--url', 'stratum+tcp://stratum.icemining.ca:3648',
      '--user', 'FPMz6eFy4fYn5B4y85GR52LWRjKXbavRde.phoslab',
      '--pass', 'c=PHL'
    ];
  } else if (brand === "nvidia") {
    miner = spawn("/home/keyvan/mining/t-rex", ['-a', 'x16r', '-o', 'stratum+tcp://stratum.icemining.ca:3648', '-u', 'FPMz6eFy4fYn5B4y85GR52LWRjKXbavRde.phoslab', '-p', 'c=PHL'], { stdio: 'inherit' });
  }
  miner = spawn(minerCmd, minerArgs, { stdio: 'inherit' });
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
  try {
    let idleTime = system.getIdleTime();
    if (miner === null && idleTime > minTime) {
      if (args.util === false) {
        console.warn("WARNING: NOT MONITORING UTILIZATION IN DETERMINATION OF IDLENESS")
        await startMiner()
      } else {
        let util = await getUtil(0);
        if (util < minUtil) {
          console.log('utilization is low, starting miner');
          await startMiner()
        }
      }
    } else if (miner !== null && idleTime <= minTime) {
      console.log('killing miner');
      miner.kill();
    }
  } catch (err) {
    console.log(err);
  }
  setTimeout(loop, 1000);
}

setTimeout(loop, 1000);
