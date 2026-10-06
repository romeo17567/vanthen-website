require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require("discord.js");

const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const WEBSITE_URL = process.env.WEBSITE_URL || "https://romeo17567.github.io/vanthen-website/";
const ENABLE_MEMBER_WELCOME = String(process.env.ENABLE_MEMBER_WELCOME || "false").toLowerCase() === "true";
const DROP_CHECK_MINUTES = Math.max(5, Number(process.env.DROP_CHECK_MINUTES || 15));

if (!TOKEN || !GUILD_ID) {
  console.error("BOT_TOKEN oder GUILD_ID fehlt in der Umgebung.");
  process.exit(1);
}

const intents = [GatewayIntentBits.Guilds];
if (ENABLE_MEMBER_WELCOME) intents.push(GatewayIntentBits.GuildMembers);

const client = new Client({ intents });

const COLORS = {
  black: 0x111111,
  white: 0xF2F2F2,
  navy: 0x14213D,
  red: 0x7B1E2B,
  green: 0x2E8B57
};

const NOTIFICATION_ROLES = [
  { name: "🔔 Drop Alerts", id: "role_drop_alerts" },
  { name: "📦 Restock Alerts", id: "role_restock_alerts" },
  { name: "📱 Social Alerts", id: "role_social_alerts" }
];

const TICKET_TYPES = {
  order: { label: "Bestellung", emoji: "📦", description: "Fragen zu einer Bestellung oder Bestellnummer" },
  shipping: { label: "Versand", emoji: "🚚", description: "Lieferzeit, Tracking oder Versandstatus" },
  return: { label: "Rückgabe", emoji: "↩️", description: "Rückgabe, Umtausch oder Reklamation" },
  size: { label: "Größe / Passform", emoji: "📏", description: "Hilfe bei Größe und Passform" },
  website: { label: "Website", emoji: "🌐", description: "Technische Probleme im VANTHEN Shop" },
  other: { label: "Sonstiges", emoji: "💬", description: "Andere Fragen an das VANTHEN Team" }
};

function findTextChannel(guild, name) {
  return guild.channels.cache.find(
    c => c.name === name && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)
  );
}

async function ensureRole(guild, name) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (role) return role;

  role = await guild.roles.create({
    name,
    color: COLORS.navy,
    mentionable: false,
    hoist: false,
    reason: "VANTHEN Community Bot notification role"
  });

  console.log(`+ Rolle erstellt: ${name}`);
  return role;
}

async function ensurePanel(channel, marker, payload) {
  if (!channel) return;

  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = messages?.find(m =>
    m.author.id === client.user.id &&
    (m.embeds?.[0]?.footer?.text === marker || m.content?.includes(marker))
  );

  if (existing) {
    await existing.edit(payload).catch(() => null);
    console.log(`✓ Panel aktualisiert: #${channel.name}`);
    return;
  }

  await channel.send(payload);
  console.log(`+ Panel erstellt: #${channel.name}`);
}

async function setupPanels(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  for (const role of NOTIFICATION_ROLES) {
    await ensureRole(guild, role.name);
  }

  const rolesChannel = findTextChannel(guild, "roles");
  const roleEmbed = new EmbedBuilder()
    .setColor(COLORS.navy)
    .setTitle("VANTHEN — NOTIFICATIONS")
    .setDescription(
      "Wähle selbst, welche VANTHEN Benachrichtigungen du erhalten möchtest.\n\n" +
      "🔔 **Drop Alerts** — neue Drops & Releases\n" +
      "📦 **Restock Alerts** — Restocks & wieder verfügbare Pieces\n" +
      "📱 **Social Alerts** — neue Social-Media-Posts"
    )
    .setFooter({ text: "VANTHEN_ROLE_PANEL" });

  const roleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("role_drop_alerts").setLabel("Drop Alerts").setEmoji("🔔").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("role_restock_alerts").setLabel("Restock Alerts").setEmoji("📦").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("role_social_alerts").setLabel("Social Alerts").setEmoji("📱").setStyle(ButtonStyle.Secondary)
  );

  await ensurePanel(rolesChannel, "VANTHEN_ROLE_PANEL", {
    embeds: [roleEmbed],
    components: [roleRow]
  });

  const ticketChannel = findTextChannel(guild, "create-ticket");
  const ticketEmbed = new EmbedBuilder()
    .setColor(COLORS.black)
    .setTitle("VANTHEN SUPPORT")
    .setDescription(
      "Wähle unten aus, wobei du Hilfe brauchst. Danach wird automatisch ein **privater Support-Kanal** für dich erstellt.\n\n" +
      "🔒 Nur du und das VANTHEN-Team können dein Ticket sehen."
    )
    .setFooter({ text: "VANTHEN_TICKET_PANEL" });

  const ticketSelect = new StringSelectMenuBuilder()
    .setCustomId("ticket_type")
    .setPlaceholder("Wähle dein Anliegen")
    .addOptions(
      Object.entries(TICKET_TYPES).map(([value, item]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.label)
          .setValue(value)
          .setDescription(item.description.slice(0, 100))
          .setEmoji(item.emoji)
      )
    );

  await ensurePanel(ticketChannel, "VANTHEN_TICKET_PANEL", {
    embeds: [ticketEmbed],
    components: [new ActionRowBuilder().addComponents(ticketSelect)]
  });

  const websiteChannel = findTextChannel(guild, "website");
  const websiteEmbed = new EmbedBuilder()
    .setColor(COLORS.white)
    .setTitle("VANTHEN ONLINE STORE")
    .setDescription("Drops. Restocks. Limited Pieces.\n\n**NOT MADE TO BELONG.**")
    .setFooter({ text: "VANTHEN_WEBSITE_PANEL" });

  const websiteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("SHOP VANTHEN")
      .setStyle(ButtonStyle.Link)
      .setURL(WEBSITE_URL)
  );

  await ensurePanel(websiteChannel, "VANTHEN_WEBSITE_PANEL", {
    embeds: [websiteEmbed],
    components: [websiteRow]
  });
}

async function toggleRole(interaction, roleName) {
  const role = interaction.guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    return interaction.reply({ content: "Die Rolle wurde nicht gefunden.", ephemeral: true });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const hasRole = member.roles.cache.has(role.id);

  if (hasRole) {
    await member.roles.remove(role);
    await interaction.reply({ content: `❌ ${roleName} entfernt.`, ephemeral: true });
  } else {
    await member.roles.add(role);
    await interaction.reply({ content: `✅ ${roleName} aktiviert.`, ephemeral: true });
  }
}

async function createTicket(interaction, typeKey) {
  const guild = interaction.guild;
  const user = interaction.user;
  const type = TICKET_TYPES[typeKey] || TICKET_TYPES.other;

  await guild.channels.fetch();
  await guild.roles.fetch();

  const supportCategory = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === "06 — SUPPORT"
  );

  const existing = guild.channels.cache.find(
    c => c.topic?.startsWith(`VANTHEN_TICKET:${user.id}`)
  );

  if (existing) {
    return interaction.reply({
      content: `Du hast bereits ein offenes Ticket: ${existing}`,
      ephemeral: true
    });
  }

  const supportRole = guild.roles.cache.find(r => r.name === "📦 Support");
  const modRole = guild.roles.cache.find(r => r.name === "🛡️ Moderator");
  const adminRole = guild.roles.cache.find(r => r.name === "🛠️ Admin");
  const founderRole = guild.roles.cache.find(r => r.name === "👑 Founder");

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  for (const role of [supportRole, modRole, adminRole, founderRole].filter(Boolean)) {
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    });
  }

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || "member";
  const typeSlug = typeKey.replace(/[^a-z0-9-]/g, "").slice(0, 10);

  const channel = await guild.channels.create({
    name: `ticket-${typeSlug}-${safeName}`,
    type: ChannelType.GuildText,
    parent: supportCategory?.id,
    topic: `VANTHEN_TICKET:${user.id}:${typeKey}`,
    permissionOverwrites: overwrites,
    reason: `VANTHEN ${type.label} ticket for ${user.tag}`
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.navy)
    .setTitle(`${type.emoji} ${type.label.toUpperCase()} — SUPPORT`)
    .setDescription(
      `Hey ${user}, dein Ticket wurde erstellt. Beschreibe bitte dein Anliegen so genau wie möglich.\n\n` +
      "**Hilfreich sind:**\n" +
      "• kurze Beschreibung des Problems\n" +
      "• bei Bestellungen: Bestellnummer\n" +
      "• bei Website-Problemen: Screenshot\n\n" +
      "⚠️ **Keine Passwörter oder Zahlungsdaten senden.**"
    )
    .setFooter({ text: `VANTHEN • ${type.label}` });

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel("Übernehmen")
      .setEmoji("🙋")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Ticket schließen")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [controls] });

  await interaction.reply({
    content: `✅ Dein **${type.label}**-Ticket wurde erstellt: ${channel}`,
    ephemeral: true
  });

  const log = findTextChannel(guild, "tickets-log");
  if (log) {
    await log.send(`🎫 **${type.label}**-Ticket erstellt: ${channel} von **${user.tag}**`);
  }
}

async function claimTicket(interaction) {
  const channel = interaction.channel;
  if (!channel?.topic?.startsWith("VANTHEN_TICKET:")) {
    return interaction.reply({ content: "Das ist kein VANTHEN Ticket.", ephemeral: true });
  }

  const allowedNames = ["👑 Founder", "🛠️ Admin", "🛡️ Moderator", "📦 Support"];
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const allowed = member.roles.cache.some(role => allowedNames.includes(role.name));

  if (!allowed) {
    return interaction.reply({ content: "Nur das VANTHEN-Team kann Tickets übernehmen.", ephemeral: true });
  }

  await interaction.reply(`🙋 Ticket übernommen von **${interaction.user.tag}**.`);
}

async function closeTicket(interaction) {
  const channel = interaction.channel;
  if (!channel?.topic?.startsWith("VANTHEN_TICKET:")) {
    return interaction.reply({ content: "Das ist kein VANTHEN Ticket.", ephemeral: true });
  }

  await interaction.reply("🔒 Ticket wird in 5 Sekunden geschlossen.");

  const log = findTextChannel(interaction.guild, "tickets-log");
  if (log) {
    await log.send(`🔒 Ticket geschlossen: **#${channel.name}** von **${interaction.user.tag}**`);
  }

  setTimeout(() => {
    channel.delete("VANTHEN ticket closed").catch(() => null);
  }, 5000);
}

function parseProductNames(jsText) {
  const block = jsText.match(/const\s+PRODUCTS\s*=\s*\[([\s\S]*?)\];/);
  if (!block) return [];

  const names = [];
  const re = /name:"([^"]+)"/g;
  let match;
  while ((match = re.exec(block[1])) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

async function fetchWebsiteProducts() {
  const appUrl = new URL("app.js", WEBSITE_URL).toString();
  const response = await fetch(appUrl, {
    headers: { "user-agent": "VANTHEN-Discord-Bot/1.0" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Website app.js antwortet mit HTTP ${response.status}`);
  }

  return parseProductNames(await response.text());
}

async function ensureBotStateChannel(guild) {
  await guild.channels.fetch();

  let channel = guild.channels.cache.find(
    c => c.name === "bot-state" && c.type === ChannelType.GuildText
  );
  if (channel) return channel;

  const staffCategory = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === "09 — STAFF"
  );

  const founder = guild.roles.cache.find(r => r.name === "👑 Founder");
  const admin = guild.roles.cache.find(r => r.name === "🛠️ Admin");

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  for (const role of [founder, admin].filter(Boolean)) {
    overwrites.push({
      id: role.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
    });
  }

  channel = await guild.channels.create({
    name: "bot-state",
    type: ChannelType.GuildText,
    parent: staffCategory?.id,
    permissionOverwrites: overwrites,
    reason: "VANTHEN bot state storage"
  });

  return channel;
}

async function getProductState(guild) {
  const channel = await ensureBotStateChannel(guild);
  const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  const stateMessage = messages?.find(
    m => m.author.id === client.user.id && m.content.startsWith("VANTHEN_PRODUCT_STATE:")
  );

  if (!stateMessage) return { channel, message: null, products: [] };

  try {
    return {
      channel,
      message: stateMessage,
      products: JSON.parse(stateMessage.content.replace("VANTHEN_PRODUCT_STATE:", ""))
    };
  } catch {
    return { channel, message: stateMessage, products: [] };
  }
}

async function saveProductState(state, products) {
  const content = `VANTHEN_PRODUCT_STATE:${JSON.stringify(products)}`;

  if (state.message) {
    await state.message.edit(content);
  } else {
    state.message = await state.channel.send(content);
  }
  state.products = products;
}

async function checkForNewDrops(guild) {
  try {
    const current = await fetchWebsiteProducts();
    if (!current.length) {
      console.warn("Drop-Check: Keine Produkte in app.js erkannt.");
      return;
    }

    const state = await getProductState(guild);

    if (!state.products.length) {
      await saveProductState(state, current);
      console.log(`Drop-Check initialisiert: ${current.length} Produkte.`);
      return;
    }

    const oldSet = new Set(state.products);
    const additions = current.filter(name => !oldSet.has(name));

    if (additions.length) {
      const channel = findTextChannel(guild, "new-drops");
      const role = guild.roles.cache.find(r => r.name === "🔔 Drop Alerts");

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(COLORS.navy)
          .setTitle("🔥 NEW VANTHEN DROP")
          .setDescription(
            additions.map(name => `**${name}**`).join("\n") +
            "\n\nJetzt im VANTHEN Online Store."
          )
          .setURL(WEBSITE_URL)
          .setFooter({ text: "NOT MADE TO BELONG." })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("SHOP NOW")
            .setStyle(ButtonStyle.Link)
            .setURL(WEBSITE_URL)
        );

        await channel.send({
          content: role ? `<@&${role.id}>` : "🔔 Neuer VANTHEN Drop",
          embeds: [embed],
          components: [row],
          allowedMentions: role ? { roles: [role.id] } : undefined
        });
      }

      console.log(`Drop-Check: ${additions.length} neues Produkt / neue Produkte erkannt.`);
    }

    const changed =
      current.length !== state.products.length ||
      current.some((name, index) => name !== state.products[index]);

    if (changed) await saveProductState(state, current);
  } catch (err) {
    console.error("Drop-Check Fehler:", err.message || err);
  }
}

async function sendWelcome(member) {
  const channel = findTextChannel(member.guild, "welcome");
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.navy)
    .setTitle("WELCOME TO VANTHEN.")
    .setDescription(
      `Willkommen ${member} 🖤\n\n` +
      "Du bist jetzt Teil der offiziellen **VANTHEN Community**.\n" +
      "Lies zuerst die Regeln und wähle anschließend deine Benachrichtigungen in **#roles**.\n\n" +
      "**NOT MADE TO BELONG.**"
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Member #${member.guild.memberCount}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("VANTHEN SHOP")
      .setStyle(ButtonStyle.Link)
      .setURL(WEBSITE_URL)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

client.once("ready", async () => {
  try {
    console.log(`Angemeldet als ${client.user.tag}`);
    client.user.setActivity("NOT MADE TO BELONG.");

    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();
    await guild.channels.fetch();

    await setupPanels(guild);
    await checkForNewDrops(guild);

    setInterval(() => {
      checkForNewDrops(guild).catch(err => console.error("Drop-Check Intervall:", err));
    }, DROP_CHECK_MINUTES * 60 * 1000);

    console.log("\n✅ VANTHEN Community Bot ist online.");
    console.log(`Automatischer Drop-Check: alle ${DROP_CHECK_MINUTES} Minuten.`);
    console.log(`Automatische Welcome-Nachrichten: ${ENABLE_MEMBER_WELCOME ? "AKTIV" : "VORBEREITET (noch deaktiviert)"}.`);
  } catch (err) {
    console.error("Startfehler:", err);
  }
});

client.on("guildMemberAdd", async member => {
  if (!ENABLE_MEMBER_WELCOME || member.guild.id !== GUILD_ID) return;
  await sendWelcome(member).catch(err => console.error("Welcome-Fehler:", err));
});

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.guild) return;

    if (interaction.isButton()) {
      if (interaction.customId === "role_drop_alerts") {
        return toggleRole(interaction, "🔔 Drop Alerts");
      }
      if (interaction.customId === "role_restock_alerts") {
        return toggleRole(interaction, "📦 Restock Alerts");
      }
      if (interaction.customId === "role_social_alerts") {
        return toggleRole(interaction, "📱 Social Alerts");
      }
      if (interaction.customId === "ticket_claim") {
        return claimTicket(interaction);
      }
      if (interaction.customId === "ticket_close") {
        return closeTicket(interaction);
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_type") {
      const selected = interaction.values[0] || "other";
      return createTicket(interaction, selected);
    }
  } catch (err) {
    console.error("Interaction-Fehler:", err);

    if (interaction.isRepliable()) {
      const payload = { content: "Es ist ein Fehler aufgetreten. Bitte versuche es erneut.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  }
});

client.login(TOKEN);
