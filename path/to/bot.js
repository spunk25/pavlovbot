// Comando para enquete customizada
else if (command === '!enquete' && args.length >= 2) {
  // ... seu código atual ...
}
// Comando para listar mensagens diurnas e noturnas
else if (command === '!mensagens') {
  const subcmd = args[0]?.toLowerCase();
  let list = [];
  let title = '';

  if (subcmd === 'diurnas') {
    // Se você tiver um array específico para dia, troque messages.randomActive por messages.randomDaytime
    list  = messages.randomActive;
    title = 'Mensagens Diurnas (60–120 min)';
  } 
  else if (subcmd === 'noturnas') {
    // Se quiser usar um array específico para noite, defina messages.randomNight no seu config
    list  = messages.randomNight || [];
    title = 'Mensagens Noturnas';
  } 
  else {
    return sendMessageToGroup('❓ Uso: !mensagens diurnas | noturnas', senderJid);
  }

  if (!list.length) {
    return sendMessageToGroup(`⚠️ ${title}: nenhuma mensagem configurada.`, senderJid);
  }

  const lines = list.map((m, i) => `${i+1}. ${m}`);
  await sendMessageToGroup(`📋 *${title}*:\n${lines.join('\n')}`, senderJid);
} 