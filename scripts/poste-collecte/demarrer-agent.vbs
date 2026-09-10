' Lance l'agent local SANS fenetre visible (au demarrage de session).
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c node agent.mjs", 0, False
