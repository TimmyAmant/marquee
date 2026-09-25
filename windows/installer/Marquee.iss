; The Windows installer, Marquee-Setup.exe, built by .github/workflows/apps.yml
; with Inno Setup from the self-contained publish folder. Per-user (no admin
; prompt): it installs to %LocalAppData%\Programs\Marquee, adds a Start menu
; entry and an uninstaller, and can launch the app when it's done.
;
; CI passes /DAppVersion=<package.json version> and /DSourceDir=<publish folder>.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\Marquee.Windows\bin\publish"
#endif

[Setup]
; Never change the AppId: it's how an update finds the existing install.
AppId={{879059C2-E41A-4B11-9541-A33DABB34E0A}
AppName=Marquee
AppVersion={#AppVersion}
AppVerName=Marquee {#AppVersion}
AppPublisher=Marquee
AppPublisherURL=https://timmyamant.github.io/marquee/
AppSupportURL=https://github.com/TimmyAmant/marquee/issues
DefaultDirName={localappdata}\Programs\Marquee
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputBaseFilename=Marquee-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\Marquee.Windows\Assets\Marquee.ico
UninstallDisplayName=Marquee
UninstallDisplayIcon={app}\Marquee.Windows.exe
VersionInfoVersion={#AppVersion}
; Closes a running Marquee before replacing its files, and reopens it after.
CloseApplications=yes
RestartApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[InstallDelete]
; A new version's folder replaces the old one wholesale, so files an older
; version shipped and this one doesn't can't linger.
Type: filesandordirs; Name: "{app}\*"

[Icons]
Name: "{autoprograms}\Marquee"; Filename: "{app}\Marquee.Windows.exe"
Name: "{autodesktop}\Marquee"; Filename: "{app}\Marquee.Windows.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Marquee.Windows.exe"; Description: "Open Marquee"; Flags: nowait postinstall skipifsilent
; The app's own updater runs this installer silently with /relaunch=1 after
; quitting, so Marquee comes back on the new version by itself. A plain
; silent install (an admin's, or CI's) leaves it closed.
Filename: "{app}\Marquee.Windows.exe"; Flags: nowait; Check: ShouldRelaunch

[Code]
function ShouldRelaunch: Boolean;
begin
  Result := ExpandConstant('{param:relaunch|0}') = '1';
end;
