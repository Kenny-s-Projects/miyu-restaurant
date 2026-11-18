// Lance le site en mode démo (npm run demo) : test en local sans clé secrète.
// Les e-mails et messages WhatsApp ne partent pas ; ils s'affichent sur http://localhost:10000/demo/
process.env.DEMO = "1"
await import("./server.mjs")
