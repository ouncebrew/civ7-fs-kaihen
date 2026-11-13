#!/usr/bin/env node
// Start kaiHEN through Civilization VII: run.cjs acquires FS and launches
// kaiHEN's RO image, then start-hen stages HEN and runs its native bootstrap
// while the endpoint is held. Civ7 counterpart of kaiHEN's ns2jb/hen.cjs.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {spawn} = require('node:child_process');
const readline = require('node:readline');

const runScript = path.join(__dirname, 'run.cjs');
const defaultShip = process.env.KAIHEN_TESTSHIP ||
  path.join(__dirname, '../../kaiHEN/0.0.4/ns2jb/testship');

function usage(code) {
  console.log(`Usage: node engine/hen.cjs CONSOLE-IP [options]
  --ship DIR            kaiHEN testship folder (default: $KAIHEN_TESTSHIP or
                        ${path.relative(process.cwd(), defaultShip)})
  --restore-save DIR    first run DIR/restore_save.py DIR/trigger-recreate CONSOLE-IP
                        (CivSwitch save-tools folder)
  --no-hbmenu           do not stage hbmenu.nro
  --no-programs         do not stage the testship programs/ folder
Start with CivSwitch's Remote JS Loader listening on the console (:9026).`);
  process.exit(code);
}

function parse(args) {
  const options = {ship: defaultShip, restore: null, hbmenu: true, programs: true};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = () => {
      if (++i === args.length) usage(1);
      return args[i];
    };
    if (arg === '--help') usage(0);
    else if (arg === '--ship') options.ship = path.resolve(value());
    else if (arg === '--restore-save') options.restore = path.resolve(value());
    else if (arg === '--no-hbmenu') options.hbmenu = false;
    else if (arg === '--no-programs') options.programs = false;
    else if (!options.console && net.isIPv4(arg)) options.console = arg;
    else usage(1);
  }
  if (!options.console) usage(1);
  return options;
}

const isFile = file => fs.statSync(file, {throwIfNoEntry: false})?.isFile();

function observe(child) {
  const seen = [];
  let exitCode;
  const lines = readline.createInterface({input: child.stdout});
  child.once('exit', code => { exitCode = code; });
  lines.on('line', line => seen.push(line));
  return {
    seen,
    waitFor(fragment) {
      if (seen.some(line => line.includes(fragment))) return Promise.resolve();
      if (exitCode !== undefined)
        return Promise.reject(Error(`run.cjs exited before "${fragment}": ${exitCode}`));
      return new Promise((resolve, reject) => {
        const finish = error => {
          lines.off('line', onLine);
          child.off('exit', onExit);
          error ? reject(error) : resolve();
        };
        const onLine = line => { if (line.includes(fragment)) finish(); };
        const onExit = code => finish(Error(`run.cjs exited before "${fragment}": ${code}`));
        lines.on('line', onLine);
        child.once('exit', onExit);
      });
    },
  };
}

function runToEnd(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() :
      reject(Error(`${path.basename(args[0])} exited with ${code}`)));
  });
}

let acquisition;
// run.cjs treats SIGTERM as a graceful release of the held endpoint.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => acquisition?.kill('SIGTERM'));

async function main() {
  const options = parse(process.argv.slice(2));
  const ship = options.ship;
  for (const file of ['ro/main', 'hen/main', 'game/main', 'bootstrap.bin',
    ...(options.hbmenu ? ['hbmenu.nro'] : [])]) {
    if (!isFile(path.join(ship, file))) throw Error(`Missing ${path.join(ship, file)}`);
  }
  if (options.restore) {
    console.log('Restoring the CivSwitch save');
    await runToEnd('python3', [path.join(options.restore, 'restore_save.py'),
      path.join(options.restore, 'trigger-recreate'), options.console]);
  }

  acquisition = spawn(process.execPath, [runScript, options.console],
    {stdio: ['inherit', 'pipe', 'inherit'], env: {...process.env,
      NS2_TARGET: 'civ7', NS2_RO_IMAGE: path.join(ship, 'ro/main')}});
  acquisition.stdout.pipe(process.stdout);
  const output = observe(acquisition);
  await output.waitFor('RO frontend verified');
  const folder = output.seen.filter(line => line.startsWith('Run folder: ')).at(-1);
  if (!folder) throw Error('run.cjs did not print its run folder');
  const run = path.resolve(folder.slice('Run folder: '.length));
  const result = JSON.parse(fs.readFileSync(path.join(run, 'result.json')));
  if (!result.verified || result.rpc?.state !== 'listening' || !result.ro?.retainedEndpoint?.ready)
    throw Error('The held RO frontend run is not ready');

  // start-hen runs from the run copy in this process: give it the same target
  // environment run.cjs gives the pipeline child.
  process.env.NS2_RUN_DIR = run;
  process.env.NS2_TARGET = 'civ7';
  process.env.NS2_TARGET_ROOT = run;
  if (options.hbmenu) process.env.HBMENU_NRO = path.join(ship, 'hbmenu.nro');
  else delete process.env.HBMENU_NRO;
  const programDirectory = path.join(ship, 'programs');
  const programs = options.programs && fs.existsSync(programDirectory) ?
    fs.readdirSync(programDirectory, {withFileTypes: true})
      .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
      .map(entry => ({source: path.join(programDirectory, entry.name), target: `/switch/${entry.name}`})) : [];
  const {main: startHen} = require(path.join(run, 'switch2/ro/start-hen.cjs'));
  try {
    const started = await startHen(path.join(ship, 'hen/main'), path.join(ship, 'bootstrap.bin'),
      path.join(ship, 'game/main'), programs);
    console.log(`HEN PID ${started.pid}; startup record: ${started.file}`);
  } catch (error) {
    console.error(`HEN startup failed; the Civ7 RPC remains held in ${run}`);
    console.error(error.stack);
    console.error('Stop with Ctrl-C and restart the console before another attempt.');
    process.exitCode = 1;
    return;
  }

  console.log('HEN is running. Close Civilization VII normally; hold R while opening a native game.');
  console.log('Keep this process running until Civilization VII closes.');
  if (acquisition.exitCode === null)
    await new Promise(resolve => acquisition.once('exit', resolve));
}

main().catch(error => {
  console.error(error.stack);
  acquisition?.kill('SIGTERM');
  process.exitCode = 1;
});
