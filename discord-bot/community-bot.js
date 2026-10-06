require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const WEBSITE_URL = process.env.WEBSITE_URL || "https://romeo17567.github.io/vanthen-website/";

if (!TOKEN || !GUILD_ID) {
  console.error("BOT_TOKEN oder GUILD_ID fehlt in der .env Datei.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const COLORS = {
  black: 0x111111,
  white: 0xF2F2F2,
  navy: 0x14213D,
  red: 0x7B1E2B
};

const NOTIFICATION_ROLES = [
  { name: "🔔 Drop Alerts", id: "role_drop_alerts" },
  { name: "📦 Restock Alerts", id: "role_restock_alerts" },
  { name: "📱 Social Alerts", id: "role_social_alerts" }
];

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

  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
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
      "Du brauchst Hilfe bei einer Bestellung, Rückgabe, Größe oder der Website?\n\n" +
      "Klicke auf **Ticket erstellen**. Dein Ticket ist nur für dich und das VANTHEN-Team sichtbar."
    )
    .setFooter({ text: "VANTHEN_TICKET_PANEL" });

  const ticketRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_create")
      .setLabel("Ticket erstellen")
      .setEmoji("🎫")
      .setStyle(ButtonStyle.Primary)
  );

  await ensurePanel(ticketChannel, "VANTHEN_TICKET_PANEL", {
    embeds: [ticketEmbed],
    components: [ticketRow]
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

async function createTicket(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  const supportCategory = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === "06 — SUPPORT"
  );

  const existing = guild.channels.cache.find(
    c => c.topic === `VANTHEN_TICKET:${user.id}`
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
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels
      ]
    }
  ];

  for (const role of [supportRole, modRole, adminRole, founderRole].filter(Boolean)) {
    overwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const safeName = user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20) || "member";

  const channel = await guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: supportCategory?.id,
    topic: `VANTHEN_TICKET:${user.id}`,
    permissionOverwrites: overwrites,
    reason: `VANTHEN support ticket for ${user.tag}`
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.navy)
    .setTitle("VANTHEN SUPPORT TICKET")
    .setDescription(
      `Hey ${user}, beschreibe bitte dein Anliegen so genau wie möglich.\n\n` +
      "Bei Bestellungen kannst du deine Bestellnummer hier privat angeben.\n" +
      "**Keine Zahlungsdaten oder Passwörter senden.**"
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Ticket schließen")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `${user}`, embeds: [embed], components: [row] });

  await interaction.reply({
    content: `✅ Dein Ticket wurde erstellt: ${channel}`,
    ephemeral: true
  });

  const log = findTextChannel(guild, "tickets-log");
  if (log) {
    await log.send(`🎫 Ticket erstellt: ${channel} von **${user.tag}**`);
  }
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

client.once("ready", async () => {
  try {
    console.log(`Angemeldet als ${client.user.tag}`);
    client.user.setActivity("NOT MADE TO BELONG.");

    const guild = await client.guilds.fetch(GUILD_ID);
    await setupPanels(guild);

    console.log("\n✅ VANTHEN Community Bot ist online.");
    console.log("Dieses Fenster offen lassen, damit Buttons und Tickets funktionieren.");
  } catch (err) {
    console.error("Startfehler:", err);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (!interaction.isButton() || !interaction.guild) return;

    if (interaction.customId === "role_drop_alerts") {
      return toggleRole(interaction, "🔔 Drop Alerts");
    }
    if (interaction.customId === "role_restock_alerts") {
      return toggleRole(interaction, "📦 Restock Alerts");
    }
    if (interaction.customId === "role_social_alerts") {
      return toggleRole(interaction, "📱 Social Alerts");
    }
    if (interaction.customId === "ticket_create") {
      return createTicket(interaction);
    }
    if (interaction.customId === "ticket_close") {
      return closeTicket(interaction);
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
