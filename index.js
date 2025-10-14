// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();
const TOKEN = process.env.DISCORD_TOKEN;
const ID_DO_DONO = process.env.ID_DO_DONO;
const CANAL_LOGS_ID = process.env.CANAL_LOGS_ID;

// Importa TODOS os componentes necessários do discord.js de uma vez!
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const fs = require('fs');

// Cria o cliente do bot com as permissões (Intents) necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// --- VARIÁVEIS GLOBAIS E CONSTANTES ---
const LOG_FILE = 'log_mensagens.txt';
const ENVIADOS_FILE = 'usuarios_enviados.json';
let enviados = [];
let mensagensEnviadasNoMinuto = 0;
const LIMITE_MENSAGENS_POR_MINUTO = 50;
const TEMPO_REINICIO = 60000;

// --- FUNÇÕES AUXILIARES ORIGINAIS (INTACTAS) ---
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function registrarLog(status, member, tipo, erro = '') {
  const log = `${new Date().toISOString()} | ${status.toUpperCase()} | ${member.user.tag} (${member.user.id}) | Tipo: ${tipo} ${erro ? '| Erro: ' + erro : ''}\n`;
  fs.appendFileSync(LOG_FILE, log);
}

function carregarEnviados() {
  if (fs.existsSync(ENVIADOS_FILE)) {
    const data = fs.readFileSync(ENVIADOS_FILE, 'utf8');
    try {
      enviados = JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler o arquivo de enviados:', error);
      enviados = [];
    }
  }
}

function salvarEnviados() {
  try {
    fs.writeFileSync(ENVIADOS_FILE, JSON.stringify(enviados, null, 2));
  } catch (error) {
    console.error('Erro ao salvar o arquivo de enviados:', error);
  }
}

async function enviarMensagemEmbed(member, embed, imageLink, tentativa = 1) {
  try {
    embed.setImage(imageLink);
    await member.send({
      embeds: [embed]
    });
    console.log(`✅ Mensagem enviada para ${member.user.tag}`);
    registrarLog('Sucesso', member, 'Embed');
    enviados.push(member.user.id);
    salvarEnviados();
    return 'sucesso';
  } catch (err) {
    if (err.code === 50007) {
      console.log(`⚠️ DM bloqueada para ${member.user.tag}`);
      registrarLog('Falha', member, 'Embed', 'DM bloqueada');
      return 'bloqueado';
    } else {
      console.log(`⚠️ Erro ao enviar para ${member.user.tag}: ${err.message}`);
      if (tentativa < 3) {
        await wait(5000);
        return await enviarMensagemEmbed(member, embed, imageLink, tentativa + 1);
      } else {
        console.log(`❌ Não foi possível enviar para ${member.user.tag}`);
        registrarLog('Falha', member, 'Embed', `Erro: ${err.message}`);
        return 'erro';
      }
    }
  }
}

async function resetarEnviados(message) {
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.reply('❌ Apenas administradores podem usar este comando.');
  }
  enviados = [];
  salvarEnviados();
  console.log('✅ Lista de enviados resetada!');
  return message.reply('✅ A lista de enviados foi resetada com sucesso!');
}

async function enviarMensagemSimples(member, messageContent, imageLinks, tentativa = 1) {
  try {
    await member.send({
      content: messageContent,
      files: imageLinks
    });
    console.log(`✅ Mensagem simples enviada para ${member.user.tag}`);
    registrarLog('Sucesso', member, 'Mensagem Simples');
    enviados.push(member.user.id);
    salvarEnviados();
    return 'sucesso';
  } catch (err) {
    if (err.code === 50007) {
      console.log(`⚠️ DM bloqueada para ${member.user.tag}`);
      registrarLog('Falha', member, 'Mensagem Simples', 'DM bloqueada');
      return 'bloqueado';
    } else {
      console.log(`⚠️ Erro ao enviar para ${member.user.tag}: ${err.message}`);
      if (tentativa < 3) {
        await wait(5000);
        return await enviarMensagemSimples(member, messageContent, imageLinks, tentativa + 1);
      } else {
        console.log(`❌ Não foi possível enviar para ${member.user.tag}`);
        registrarLog('Falha', member, 'Mensagem Simples', `Erro: ${err.message}`);
        return 'erro';
      }
    }
  }
}

async function enviarResumoStatus(message, successCount, errorCount, blockedCount) {
  const resumo = `📨 **Resumo do envio**:\n\n✅ ${successCount} enviados com sucesso\n🚫 ${blockedCount} bloqueados\n❌ ${errorCount} com erro`;
  console.log(resumo);
  message.reply(resumo);
}

async function enviarMensagens(guild, embedOrMessage, imageLinkOrLinks, isEmbed, message, cargosFiltro = []) {
  const members = await guild.members.fetch();
  let successCount = 0;
  let errorCount = 0;
  let blockedCount = 0;
  for (const member of members.values()) {
    const temCargoValido = cargosFiltro.length === 0 || member.roles.cache.some(role => cargosFiltro.includes(role.name.toLowerCase()));
    if (!member.user.bot && !enviados.includes(member.user.id) && temCargoValido) {
      let resultado;
      if (isEmbed) {
        resultado = await enviarMensagemEmbed(member, embedOrMessage, imageLinkOrLinks);
      } else {
        resultado = await enviarMensagemSimples(member, embedOrMessage, imageLinkOrLinks);
      }
      if (resultado === 'sucesso') successCount++;
      else if (resultado === 'bloqueado') blockedCount++;
      else if (resultado === 'erro') errorCount++;
      mensagensEnviadasNoMinuto++;
      if (mensagensEnviadasNoMinuto >= LIMITE_MENSAGENS_POR_MINUTO) {
        console.log("Limite de 50 mensagens por minuto atingido. Aguardando reinício...");
        await wait(TEMPO_REINICIO);
        mensagensEnviadasNoMinuto = 0;
      }
      await wait(1200);
    }
  }
  await enviarResumoStatus(message, successCount, errorCount, blockedCount);
}

// --- EVENTO PRINCIPAL DE MENSAGENS (COMANDOS) ---
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // --- FUNÇÃO 1: Encaminhar DMs abertas para o canal de logs ---
  if (!message.guild) {
    if (message.author.id === ID_DO_DONO) return;
    try {
        const canalLogs = await client.channels.fetch(CANAL_LOGS_ID);
        if (canalLogs) {
            const embedEncaminhado = new EmbedBuilder().setColor('#3498db').setTitle('📥 Mensagem Recebida via DM').setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() }).addFields({ name: 'Usuário', value: `${message.author} (${message.author.id})` }).setTimestamp();
            if (message.content) { embedEncaminhado.setDescription(`>>> ${message.content}`); }
            if (message.attachments.size > 0) { const anexo = message.attachments.first(); embedEncaminhado.setImage(anexo.url); }
            await canalLogs.send({ embeds: [embedEncaminhado] });
            await message.reply("Sua mensagem foi recebida e encaminhada para o administrador. Obrigado!");
        }
    } catch(e){ console.error("Falha ao encaminhar DM:", e); }
    return;
  }

  // --- FUNÇÃO 2: Seus comandos de envio em massa ---
  if (message.content.startsWith('!enviardmembed')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Apenas administradores podem usar este comando.');
    }
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      return message.reply('❌ Informe pelo menos um cargo. Exemplo: `!enviardmembed membro visitante`');
    }
    const cargosFiltro = args.map(c => c.toLowerCase());
    const embed = new EmbedBuilder().setTitle('📢 Massive Nex: Anjo da Morte <t:1746054000:R>').setDescription(`:calendar_spiral: <t:1746054000:F>\n:round_pushpin: **Mundo 75**\n:moneybag: **Compartilhamento de saque ativo** — ou seja, o drop fica inteiramente para você!\n\n**Requisitos:**\nAcesso ao nosso Discord: https://discord.com/channels/380398637353533440/1236026526882074756\nAcesso a [Nex](https://pt.runescape.wiki/w/Nex) ou [Chave Congelada](https://pt.runescape.wiki/w/Chave_congelada) e [Conjunto Cerimonial](https://pt.runescape.wiki/w/T%C3%BAnicas_cerimoniais_antigas)\n\n**Valores dos raros:**\n• Códex da Praesul: **747m**\n• Varinha da Praesul: **106m**\n• Núcleo Imperium: **98m**`).setColor('#112072').setFooter({ text: 'Equipe Warlords' });
    const imageLink = 'https://pt.runescape.wiki/images/Evento_de_P%C3%A1scoa_2025.png?f8137';
    await enviarMensagens(message.guild, embed, imageLink, true, message, cargosFiltro);
  }
  
  if (message.content.startsWith('!enviardmsimples')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Apenas administradores podem usar este comando.');
    }
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      return message.reply('❌ Informe pelo menos um cargo. Exemplo: `!enviardmsimples membro visitante`');
    }
    const cargosFiltro = args.map(c => c.toLowerCase());
    const messageContent = `# 🔎 PIQUE-ESCONDE 🕵️ <t:1756576800:R>\n\nPara comemorar 1 ano da existência do nosso segundo clã, o 🎂 **Warlords Unity** 🎉, organizamos mais uma edição de um evento que muitos pediram no decorrer dos últimos meses!\n\n📅 **Data:** <t:1756576800:D>\n⏰ **Horário:** <t:1756576800:t>\n🌎 **Mundo:** 47\n📍 **Ponto de encontro:** Burthorpe\n💰 **2b em prêmios**\n\n**Como funciona**❓\nQuatro organizadores do evento se escondem por Guilenor e dão pistas até que alguém os encontre.\nA cada rodada, os escondidos poderão se camuflar cada vez mais no mapa, seja usando roupas semelhantes às de NPCs, transmutações, poção da camuflagem, descansos, etc. Vence quem negociar primeiro com o escondido.\n\n**Mais informações sobre o evento no canal oficial:** 👉https://discord.com/channels/380398637353533440/1410658629836603443👈`;
    const imageLinks = ['https://i.imgur.com/bIecnPf.png'];
    await enviarMensagens(message.guild, messageContent, imageLinks, false, message, cargosFiltro);
  }
  
  if (message.content.startsWith('!resetarenviados')) {
    await resetarEnviados(message);
  }
  
  // --- FUNÇÃO 3: NOVO COMANDO PARA ENVIAR PESQUISA POR DM ---
if (message.content.startsWith('!enviarpesquisadm')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Apenas administradores podem usar este comando.');
    }
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      return message.reply('❌ Especifique para quais cargos enviar. Ex: `!enviarpesquisadm membro`');
    }
    const cargosFiltro = args.map(c => c.toLowerCase());
    await message.reply(`✅ Iniciando envio da pesquisa para membros com os cargos: **${cargosFiltro.join(', ')}**. Membros que já receberam serão ignorados.`);
    
    const members = await message.guild.members.fetch();
    let successCount = 0, blockedCount = 0, errorCount = 0;
    
    const embedPesquisa = new EmbedBuilder().setColor('#5865F2').setTitle('🚨 Futuro dos eventos do clã pós Leagues').setDescription('Com o fim das Leagues se aproximando, a liderança gostaria de ouvir a sua opinião para planejarmos os próximos passos e eventos do nosso clã.\n\nSua participação é muito importante para mantermos o clã ativo e engajado. Por favor, clique no botão abaixo para responder quatro rápidas perguntas.').setFooter({ text: 'A sua voz molda o futuro do clã! 🗣️' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('iniciar_pesquisa_clã_dm').setLabel('📝 Responder à Pesquisa').setStyle(ButtonStyle.Success));

    for (const member of members.values()) {
      const temCargoValido = member.roles.cache.some(role => cargosFiltro.includes(role.name.toLowerCase()));
      
      if (!member.user.bot && temCargoValido && !enviados.includes(member.user.id)) {
        try {
          await member.send({ embeds: [embedPesquisa], components: [row] });
          console.log(`✅ Pesquisa enviada para ${member.user.tag}`);
          
          enviados.push(member.user.id);
          salvarEnviados();
          
          successCount++;
        } catch (err) {
          if (err.code === 50007) { 
            console.log(`⚠️ DM bloqueada para ${member.user.tag}`); 
            blockedCount++; 
          } else { 
            console.error(`❌ Erro ao enviar para ${member.user.tag}:`, err); 
            errorCount++; 
          }
        }

        // --- LÓGICA DE LIMITE ADICIONADA AQUI ---
        mensagensEnviadasNoMinuto++;
        if (mensagensEnviadasNoMinuto >= LIMITE_MENSAGENS_POR_MINUTO) {
          console.log("Limite de 50 mensagens por minuto atingido. Aguardando 1 minuto para reiniciar...");
          await wait(TEMPO_REINICIO); // TEMPO_REINICIO = 60000ms
          mensagensEnviadasNoMinuto = 0;
        }
        // --- FIM DA LÓGICA DE LIMITE ---

        await wait(1200); // Mantemos a pausa curta para sermos gentis com a API
      }
    }
    
    await message.channel.send(`**Resumo do Envio da Pesquisa:**\n✅ ${successCount} enviados.\n🚫 ${blockedCount} com DMs bloqueadas.\n❌ ${errorCount} com erro.`);
}
});


// --- OUVINTE DE INTERAÇÕES (PARA OS BOTÕES E FORMULÁRIOS DA PESQUISA) ---
// ==============================================================================
// SUBSTITUA TODO O SEU BLOCO client.on('interactionCreate', ...) POR ESTE
// ==============================================================================
client.on('interactionCreate', async interaction => {
  
  // --- PARTE 1: Lida com o clique no botão para ABRIR o formulário ---
  if (interaction.isButton() && interaction.customId === 'iniciar_pesquisa_clã_dm') {
    
    const modal = new ModalBuilder()
      .setCustomId('modal_pesquisa_clã_dm')
      .setTitle('Futuro dos eventos do clã pós Leagues');

    // PERGUNTA 1: MAZCAB
    const mazcabInput = new TextInputBuilder()
      .setCustomId('mazcabInput') // ID ÚNICO
      .setLabel("Raids: A Libertação de Mazcab")
      .setPlaceholder("Você tem interesse em participar de eventos semanais?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    // PERGUNTA 2: NEX AOD
    const nexAodInput = new TextInputBuilder()
      .setCustomId('nexAodInput') // ID ÚNICO
      .setLabel("Massive Nex: Anjo da Morte")
      .setPlaceholder("Você tem interesse em participar de eventos semanais?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    // PERGUNTA 3: VORAGO
    const voragoInput = new TextInputBuilder()
      .setCustomId('voragoInput') // ID ÚNICO
      .setLabel("Vorago: Modo Difícil")
      .setPlaceholder("Você tem interesse em participar de eventos semanais?")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);
      
    // PERGUNTA 4: SUGESTÕES
    const sugestoesInput = new TextInputBuilder()
      .setCustomId('sugestoesInput') // ID ÚNICO
      .setLabel("Outros eventos")
      .setPlaceholder("Há algum outro tipo de evento que gostaria de ver no clã? Deixe aqui a sua sugestão.")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    // Adiciona os campos ao formulário em "linhas" separadas
    const row1 = new ActionRowBuilder().addComponents(mazcabInput);
    const row2 = new ActionRowBuilder().addComponents(nexAodInput);
    const row3 = new ActionRowBuilder().addComponents(voragoInput);
    const row4 = new ActionRowBuilder().addComponents(sugestoesInput);

    // Adiciona as linhas ao modal
    modal.addComponents(row1, row2, row3, row4);

    // Mostra o formulário para o usuário
    await interaction.showModal(modal);
  }

  // --- PARTE 2: Lida com o ENVIO do formulário preenchido ---
  if (interaction.isModalSubmit() && interaction.customId === 'modal_pesquisa_clã_dm') {
    
    // Coleta as respostas de cada campo usando seus IDs únicos
    const respostaMazcab = interaction.fields.getTextInputValue('mazcabInput');
    const respostaNexAod = interaction.fields.getTextInputValue('nexAodInput');
    const respostaVorago = interaction.fields.getTextInputValue('voragoInput');
    const respostaSugestoes = interaction.fields.getTextInputValue('sugestoesInput');

    // Agradece ao usuário
    await interaction.reply({ content: '✅ Pesquisa enviada com sucesso! Muito obrigado pela sua opinião.', flags: [MessageFlags.Ephemeral] });

    // Formata a resposta em um Embed para enviar ao canal da administração
    const embedResposta = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('📋 Nova Resposta da Pesquisa Recebida!')
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .addFields(
        { name: '👤 Usuário que respondeu', value: `${interaction.user} (${interaction.user.id})` },
        { name: '❓ Raids: Libertação de Mazcab', value: `>>> ${respostaMazcab || 'Não respondeu.'}` },
        { name: '❓ Massive Nex: Anjo da Morte', value: `>>> ${respostaNexAod || 'Não respondeu.'}` },
        { name: '❓ Vorago: Modo Difícil', value: `>>> ${respostaVorago || 'Não respondeu.'}` },
        { name: '💡 Outras Sugestões de Eventos', value: `>>> ${respostaSugestoes || 'Nenhuma sugestão.'}` }
      )
      .setTimestamp();
    
    // Envia o embed com a resposta para o seu canal de logs
    try {
      const canalLogs = await client.channels.fetch(CANAL_LOGS_ID);
      if (canalLogs) {
        await canalLogs.send({ embeds: [embedResposta] });
      }
    } catch (error) {
      console.error("Erro ao enviar resposta da pesquisa para o canal de logs:", error);
    }
  }
});


// --- EVENTO DE INICIALIZAÇÃO DO BOT ---
client.once('ready', () => {
  console.log(`🤖 Bot iniciado como ${client.user.tag}`);
  console.log(`Pronto para detonar! Ouvindo comandos e interações.`);
  carregarEnviados();
});


// --- LOGIN DO BOT ---
client.login(TOKEN);