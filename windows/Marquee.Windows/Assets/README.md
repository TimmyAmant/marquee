# Assets

Image assets for the Windows app go here. None exist yet: the project
deliberately references no icon or splash files, so a checkout builds without
binaries in the repository.

When the app icon is added, generate `Marquee.ico` from the Mac app's icon set
(`mac/Marquee/Resources/Assets.xcassets/AppIcon.appiconset`) and point
`ApplicationIcon` in `Marquee.Windows.csproj` at it. Keep every asset the
project references present in this folder.
