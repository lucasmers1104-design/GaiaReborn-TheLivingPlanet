#!/usr/bin/env node
/*
 * Packs the game into a Windows installer for sending out a demo:
 * tmp/demo/GaiaReborn-Demo-<version>-Setup.exe. Uses only what Windows ships:
 * IExpress builds the self-extracting exe, tar zips the game, and the game
 * runs in an Edge (or Chrome) app window over file:// with its own profile, so
 * the demo's saves live beside the install and the music may start at once.
 * The bundle is compiled separately with the developer mode and the intro's
 * dev switch off; the shared simulation.js stays untouched.
 *
 *   node tools/demo-installer.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'tmp', 'demo');
const GAME = path.join(OUT, 'game');
const PACK = path.join(OUT, 'pack');
const version = require(path.join(ROOT, 'package.json')).version;
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd === 'npx' });

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(GAME, { recursive: true });
fs.mkdirSync(PACK, { recursive: true });

const bundle = path.join(GAME, 'simulation.js');
run('npx', ['tsc', '-p', 'tsconfig.json', '--outFile', bundle]);
let src = fs.readFileSync(bundle, 'utf8');
for (const flag of ['DEV_MODE_AVAILABLE', 'INTRO_DEV']) {
  const line = new RegExp(`^(\\s*SE\\.${flag} = )true;$`, 'm');
  if (!line.test(src)) throw new Error(`demo-installer: SE.${flag} = true not found in the bundle`);
  src = src.replace(line, '$1false;');
}
fs.writeFileSync(bundle, src);
run('node', ['tools/stamp-version.js', bundle]);
run('node', ['tools/wrap-bundle.js', bundle]);

for (const f of ['index.html', 'styles.css']) fs.copyFileSync(path.join(ROOT, f), path.join(GAME, f));
fs.cpSync(path.join(ROOT, 'css'), path.join(GAME, 'css'), { recursive: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(GAME, 'assets'), {
  recursive: true,
  filter: (p) => !p.includes('Gaia_Reborn_Living_UI_Concept'),
});
run(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-a', '-cf', path.join(PACK, 'game.zip'), '-C', GAME, '.']);

fs.writeFileSync(path.join(PACK, 'install.ps1'), `$ErrorActionPreference = 'Stop'
$name = 'Gaia Reborn Demo'
$dir = Join-Path $env:LOCALAPPDATA 'GaiaRebornDemo'
$game = Join-Path $dir 'game'
$browser = @(
  "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
  "$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Microsoft Edge oder Google Chrome wird benoetigt.' }

if (Test-Path $game) { Remove-Item $game -Recurse -Force }
New-Item -ItemType Directory -Force $game | Out-Null
tar -xf (Join-Path $PSScriptRoot 'game.zip') -C $game
if ($LASTEXITCODE) { throw 'Entpacken fehlgeschlagen.' }

$url = 'file:///' + ((Join-Path $game 'index.html') -replace '\\\\', '/')
$flags = "--app=""$url"" --user-data-dir=""$dir\\profile"" --autoplay-policy=no-user-gesture-required --start-fullscreen --no-first-run"
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) $name
New-Item -ItemType Directory -Force $menu | Out-Null
$shell = New-Object -ComObject WScript.Shell
foreach ($lnk in @((Join-Path $menu "$name.lnk"), (Join-Path ([Environment]::GetFolderPath('Desktop')) "$name.lnk"))) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $browser
  $s.Arguments = $flags
  $s.WorkingDirectory = $game
  $s.Save()
}
Copy-Item (Join-Path $PSScriptRoot 'uninstall.ps1') $dir -Force
$u = $shell.CreateShortcut((Join-Path $menu "$name deinstallieren.lnk"))
$u.TargetPath = 'powershell.exe'
$u.Arguments = "-NoProfile -ExecutionPolicy Bypass -File ""$dir\\uninstall.ps1"""
$u.Save()

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show("$name wurde installiert. Start ueber die Verknuepfung auf dem Desktop.", $name) | Out-Null
Start-Process $browser $flags
`);

fs.writeFileSync(path.join(PACK, 'uninstall.ps1'), `$name = 'Gaia Reborn Demo'
Add-Type -AssemblyName System.Windows.Forms
if ([System.Windows.Forms.MessageBox]::Show("$name und alle Spielstaende entfernen?", $name, 'YesNo') -ne 'Yes') { exit }
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) "$name.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Programs')) $name) -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'GaiaRebornDemo') -Recurse -Force -ErrorAction SilentlyContinue
`);

// IExpress runs AppLaunched through a short command line, so a .cmd starts PowerShell.
fs.writeFileSync(path.join(PACK, 'install.cmd'),
  '@powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"\r\n');

const exe = path.join(OUT, `GaiaReborn-Demo-${version}-Setup.exe`);
const files = ['install.cmd', 'install.ps1', 'uninstall.ps1', 'game.zip'];
fs.writeFileSync(path.join(OUT, 'setup.sed'), [
  '[Version]', 'Class=IEXPRESS', 'SEDVersion=3',
  '[Options]', 'PackagePurpose=InstallApp', 'ShowInstallProgramWindow=1', 'HideExtractAnimation=0',
  'UseLongFileName=1', 'InsideCompressed=0', 'CAB_FixedSize=0', 'CAB_ResvCodeSigning=0', 'RebootMode=N',
  'InstallPrompt=%InstallPrompt%', 'DisplayLicense=%DisplayLicense%', 'FinishMessage=%FinishMessage%',
  'TargetName=%TargetName%', 'FriendlyName=%FriendlyName%', 'AppLaunched=%AppLaunched%',
  'PostInstallCmd=%PostInstallCmd%', 'AdminQuietInstCmd=%AdminQuietInstCmd%', 'UserQuietInstCmd=%UserQuietInstCmd%',
  'SourceFiles=SourceFiles',
  '[Strings]', 'InstallPrompt=', 'DisplayLicense=', 'FinishMessage=',
  `TargetName=${exe}`, `FriendlyName=Gaia Reborn Demo ${version}`, 'AppLaunched=cmd /c install.cmd',
  'PostInstallCmd=<None>', 'AdminQuietInstCmd=', 'UserQuietInstCmd=',
  ...files.map((f, i) => `FILE${i}="${f}"`),
  '[SourceFiles]', `SourceFiles0=${PACK}\\`,
  '[SourceFiles0]', ...files.map((_, i) => `%FILE${i}%=`),
].join('\r\n') + '\r\n');
run('iexpress', ['/N', '/Q', path.join(OUT, 'setup.sed')]);
if (!fs.existsSync(exe)) throw new Error('demo-installer: IExpress wrote no exe');
console.log(`${exe} (${(fs.statSync(exe).size / 1e6).toFixed(1)} MB)`);
