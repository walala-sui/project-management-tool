Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

workDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = workDir

WshShell.Run "node server.js", 0, False
WScript.Sleep 2000
WshShell.Run "http://localhost:3000"
