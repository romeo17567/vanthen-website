require("dotenv").config();

const crypto = require("crypto");
const { createTikTokOAuth } = require("./tiktok-oauth");
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
  StringSelectMenuOptionBuilder,
  SlashCommandBuilder
} = require("discord.js");

const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const WEBSITE_URL = process.env.WEBSITE_URL || "https://romeo17567.github.io/vanthen-website/";
const ENABLE_MEMBER_WELCOME = String(process.env.ENABLE_MEMBER_WELCOME || "true").toLowerCase() === "true";
const DROP_CHECK_MINUTES = Math.max(5, Number(process.env.DROP_CHECK_MINUTES || 15));
const SOCIAL_CHECK_MINUTES = Math.max(5, Number(process.env.SOCIAL_CHECK_MINUTES || 10));
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || "";
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID || "";
const INSTAGRAM_API_BASE = process.env.INSTAGRAM_API_BASE || "https://graph.instagram.com/v25.0";
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || "";
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || "";

if (!TOKEN || !GUILD_ID) {
  console.error("BOT_TOKEN oder GUILD_ID fehlt in der Umgebung.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const tiktokOAuth = createTikTokOAuth({
  client,
  guildId: GUILD_ID,
  botToken: TOKEN,
  clientKey: TIKTOK_CLIENT_KEY,
  clientSecret: TIKTOK_CLIENT_SECRET,
  redirectUri: TIKTOK_REDIRECT_URI,
  ensureStateChannel: ensureBotStateChannel,
  onConnected: checkForSocialPosts
});

const COLORS = {
  black: 0x111111,
  white: 0xF2F2F2,
  navy: 0x14213D,
  red: 0x7B1E2B,
  green: 0x2E8B57,
  gold: 0xD4AF37,
  purple: 0x815AC0
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

const scheduledGiveaways = new Map();

function findTextChannel(guild, name) {
  return guild.channels.cache.find(
    c => c.name === name && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)
  );
}

function isStaff(member) {
  const staffNames = ["👑 Founder", "🛠️ Admin", "🛡️ Moderator", "📦 Support"];
  return member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.roles.cache.some(role => staffNames.includes(role.name));
}

async function ensureRole(guild, name, options = {}) {
  let role = guild.roles.cache.find(r => r.name === name);
  if (role) return role;

  role = await guild.roles.create({
    name,
    color: options.color || COLORS.navy,
    mentionable: options.mentionable || false,
    hoist: options.hoist || false,
    reason: "VANTHEN Community Bot"
  });

  console.log(`+ Rolle erstellt: ${name}`);
  return role;
}

async function ensureTextChannel(guild, name, categoryName, overwrites = []) {
  let channel = findTextChannel(guild, name);
  if (channel) return channel;

  const category = guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === categoryName
  );

  channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category?.id,
    permissionOverwrites: overwrites,
    reason: "VANTHEN Community Bot"
  });

  console.log(`+ Kanal erstellt: #${name}`);
  return channel;
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

async function ensureProChannels(guild) {
  const vip = guild.roles.cache.find(r => r.name === "⭐ VIP");
  const founder = guild.roles.cache.find(r => r.name === "👑 Founder");
  const admin = guild.roles.cache.find(r => r.name === "🛠️ Admin");
  const moderator = guild.roles.cache.find(r => r.name === "🛡️ Moderator");

  const vipOverwrites = [
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

  for (const role of [vip, founder, admin, moderator].filter(Boolean)) {
    vipOverwrites.push({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  await ensureTextChannel(guild, "giveaways", "05 — COMMUNITY");
  await ensureTextChannel(guild, "vip-lounge", "05 — COMMUNITY", vipOverwrites);
}

async function setupPanels(guild) {
  await guild.roles.fetch();
  await guild.channels.fetch();

  for (const role of NOTIFICATION_ROLES) {
    await ensureRole(guild, role.name);
  }

  await ensureProChannels(guild);

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

  const vipChannel = findTextChannel(guild, "vip-lounge");
  const vipEmbed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle("⭐ VANTHEN VIP LOUNGE")
    .setDescription(
      "Exklusiver Bereich für VANTHEN VIPs.\n\n" +
      "Hier können Previews, spezielle Aktionen, limitierte Codes und Community-Extras geteilt werden."
    )
    .setFooter({ text: "VANTHEN_VIP_PANEL" });

  await ensurePanel(vipChannel, "VANTHEN_VIP_PANEL", { embeds: [vipEmbed] });
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
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
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

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!isStaff(member)) {
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
  while ((match = re.exec(block[1])) !== null) names.push(match[1]);
  return [...new Set(names)];
}

async function fetchWebsiteProducts() {
  const appUrl = new URL(`app.js?v=${Date.now()}`, WEBSITE_URL).toString();
  const response = await fetch(appUrl, {
    headers: { "user-agent": "VANTHEN-Discord-Bot/2.0" },
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Website app.js antwortet mit HTTP ${response.status}`);
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

  return guild.channels.create({
    name: "bot-state",
    type: ChannelType.GuildText,
    parent: staffCategory?.id,
    permissionOverwrites: overwrites,
    reason: "VANTHEN bot state storage"
  });
}

async function getProductState(guild) {
  const channel = await ensureBotStateChannel(guild);
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const stateMessage = messages?.find(
    m => m.author.id === client.user.id && m.content.startsWith("VANTHEN_PRODUCT_STATE:")
  );

  if (!stateMessage) return { channel, message: null, current: [], everSeen: [] };

  try {
    const parsed = JSON.parse(stateMessage.content.replace("VANTHEN_PRODUCT_STATE:", ""));
    if (Array.isArray(parsed)) {
      return { channel, message: stateMessage, current: parsed, everSeen: parsed };
    }
    return {
      channel,
      message: stateMessage,
      current: Array.isArray(parsed.current) ? parsed.current : [],
      everSeen: Array.isArray(parsed.everSeen) ? parsed.everSeen : []
    };
  } catch {
    return { channel, message: stateMessage, current: [], everSeen: [] };
  }
}

async function saveProductState(state, current, everSeen) {
  const content = `VANTHEN_PRODUCT_STATE:${JSON.stringify({ current, everSeen })}`;
  if (state.message) await state.message.edit(content);
  else state.message = await state.channel.send(content);
  state.current = current;
  state.everSeen = everSeen;
}

async function sendDropAnnouncement(guild, names, kind) {
  const config = kind === "restock"
    ? { channel: "restocks", role: "📦 Restock Alerts", title: "📦 VANTHEN RESTOCK", color: COLORS.green, text: "wieder verfügbar" }
    : kind === "soldout"
      ? { channel: "sold-out", role: null, title: "SOLD OUT", color: COLORS.red, text: "aktuell nicht verfügbar" }
      : { channel: "new-drops", role: "🔔 Drop Alerts", title: "🔥 NEW VANTHEN DROP", color: COLORS.navy, text: "jetzt verfügbar" };

  const channel = findTextChannel(guild, config.channel);
  if (!channel || !names.length) return;

  const role = config.role ? guild.roles.cache.find(r => r.name === config.role) : null;

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(config.title)
    .setDescription(
      names.map(name => `**${name}**`).join("\n") +
      `\n\n${config.text} im VANTHEN Online Store.`
    )
    .setURL(WEBSITE_URL)
    .setFooter({ text: "NOT MADE TO BELONG." })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("SHOP NOW").setStyle(ButtonStyle.Link).setURL(WEBSITE_URL)
  );

  await channel.send({
    content: role ? `<@&${role.id}>` : undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: role ? { roles: [role.id] } : undefined
  });
}

async function checkForProductChanges(guild) {
  try {
    const current = await fetchWebsiteProducts();
    if (!current.length) {
      console.warn("Produkt-Check: Keine Produkte in app.js erkannt.");
      return;
    }

    const state = await getProductState(guild);

    if (!state.current.length) {
      await saveProductState(state, current, [...new Set([...state.everSeen, ...current])]);
      console.log(`Produkt-Check initialisiert: ${current.length} Produkte.`);
      return;
    }

    const oldCurrent = new Set(state.current);
    const ever = new Set(state.everSeen);
    const currentSet = new Set(current);

    const added = current.filter(name => !oldCurrent.has(name));
    const restocks = added.filter(name => ever.has(name));
    const newDrops = added.filter(name => !ever.has(name));
    const soldOut = state.current.filter(name => !currentSet.has(name));

    if (newDrops.length) await sendDropAnnouncement(guild, newDrops, "drop");
    if (restocks.length) await sendDropAnnouncement(guild, restocks, "restock");
    if (soldOut.length) await sendDropAnnouncement(guild, soldOut, "soldout");

    const nextEver = [...new Set([...state.everSeen, ...current])];
    if (
      current.length !== state.current.length ||
      current.some((name, index) => name !== state.current[index])
    ) {
      await saveProductState(state, current, nextEver);
    }
  } catch (err) {
    console.error("Produkt-Check Fehler:", err.message || err);
  }
}


async function getSocialState(guild) {
  const channel = await ensureBotStateChannel(guild);
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const stateMessage = messages?.find(
    m => m.author.id === client.user.id && m.content.startsWith("VANTHEN_SOCIAL_STATE:")
  );

  if (!stateMessage) {
    return { channel, message: null, instagram: [], tiktok: [], tiktokInitialized: false };
  }

  try {
    const parsed = JSON.parse(stateMessage.content.replace("VANTHEN_SOCIAL_STATE:", ""));
    return {
      channel,
      message: stateMessage,
      instagram: Array.isArray(parsed.instagram) ? parsed.instagram : [],
      tiktok: Array.isArray(parsed.tiktok) ? parsed.tiktok : [],
      tiktokInitialized: parsed.tiktokInitialized === true
    };
  } catch {
    return { channel, message: stateMessage, instagram: [], tiktok: [], tiktokInitialized: false };
  }
}

async function saveSocialState(state) {
  const payload = {
    instagram: (state.instagram || []).slice(0, 50),
    tiktok: (state.tiktok || []).slice(0, 50),
    tiktokInitialized: state.tiktokInitialized === true
  };
  const content = `VANTHEN_SOCIAL_STATE:${JSON.stringify(payload)}`;

  if (state.message) {
    await state.message.edit(content);
  } else {
    state.message = await state.channel.send(content);
  }
}

async function resolveInstagramUserId() {
  if (INSTAGRAM_USER_ID) return INSTAGRAM_USER_ID;
  if (!INSTAGRAM_ACCESS_TOKEN) return "";

  const url = new URL(`${INSTAGRAM_API_BASE}/me`);
  url.searchParams.set("fields", "id,username");

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
      "user-agent": "VANTHEN-Discord-Bot/3.1"
    },
    cache: "no-store"
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(`Instagram /me: ${body?.error?.message || "HTTP " + response.status}`);
  }

  return String(body.id || "");
}

async function fetchInstagramPosts() {
  if (!INSTAGRAM_ACCESS_TOKEN) return null;

  const userId = await resolveInstagramUserId();
  if (!userId) throw new Error("Instagram User ID konnte nicht automatisch ermittelt werden.");

  const url = new URL(`${INSTAGRAM_API_BASE}/${userId}/media`);
  url.searchParams.set("fields", "id,caption,media_type,permalink,timestamp,media_url,thumbnail_url");
  url.searchParams.set("limit", "10");

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${INSTAGRAM_ACCESS_TOKEN}`,
      "user-agent": "VANTHEN-Discord-Bot/3.1"
    },
    cache: "no-store"
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(`Instagram API: ${body?.error?.message || "HTTP " + response.status}`);
  }

  return Array.isArray(body.data) ? body.data : [];
}

async function fetchTikTokPosts(guild) {
  const accessToken = (await tiktokOAuth.getAccessToken(guild)) || TIKTOK_ACCESS_TOKEN;
  if (!accessToken) return null;

  const response = await fetch(
    "https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,embed_link,create_time",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "user-agent": "VANTHEN-Discord-Bot/4.0"
      },
      body: JSON.stringify({ max_count: 20 }),
      cache: "no-store"
    }
  );

  const body = await response.json().catch(() => ({}));
  const tiktokErrorCode = String(body?.error?.code || "").toLowerCase();
  if (!response.ok || (tiktokErrorCode && tiktokErrorCode !== "ok")) {
    throw new Error(`TikTok API: ${body?.error?.message || body?.error?.code || "HTTP " + response.status}`);
  }

  return Array.isArray(body?.data?.videos) ? body.data.videos : [];
}

async function announceDetectedSocial(guild, platform, post) {
  const isInstagram = platform === "instagram";
  const channel = findTextChannel(guild, isInstagram ? "instagram" : "tiktok");
  if (!channel) return;

  const alertRole = guild.roles.cache.find(r => r.name === "📱 Social Alerts");
  const title = isInstagram ? "📸 NEW VANTHEN INSTAGRAM POST" : "🎵 NEW VANTHEN TIKTOK";
  const description = isInstagram
    ? (post.caption || "Neuer VANTHEN Instagram-Post ist online.")
    : (post.video_description || post.title || "Neuer VANTHEN TikTok ist online.");
  const postUrl = isInstagram ? post.permalink : post.embed_link;

  const embed = new EmbedBuilder()
    .setColor(isInstagram ? COLORS.purple : COLORS.black)
    .setTitle(title)
    .setDescription(String(description).slice(0, 3500))
    .setFooter({ text: "VANTHEN • SOCIAL AUTO" })
    .setTimestamp(post.timestamp ? new Date(post.timestamp) : post.create_time ? new Date(Number(post.create_time) * 1000) : new Date());

  if (postUrl) embed.setURL(postUrl);
  const imageUrl = isInstagram ? (post.thumbnail_url || post.media_url) : post.cover_image_url;
  if (imageUrl) embed.setImage(imageUrl);

  const components = [];
  if (postUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(isInstagram ? "INSTAGRAM ÖFFNEN" : "TIKTOK ÖFFNEN")
          .setStyle(ButtonStyle.Link)
          .setURL(postUrl)
      )
    );
  }

  await channel.send({
    content: alertRole ? `<@&${alertRole.id}>` : undefined,
    embeds: [embed],
    components,
    allowedMentions: alertRole ? { roles: [alertRole.id] } : undefined
  });
}

async function checkForSocialPosts(guild) {
  const state = await getSocialState(guild);
  let changed = false;

  if (INSTAGRAM_ACCESS_TOKEN && INSTAGRAM_USER_ID) {
    try {
      const posts = await fetchInstagramPosts();
      if (posts) {
        const ids = posts.map(p => String(p.id));
        if (!state.instagram.length) {
          state.instagram = ids;
          changed = true;
          console.log(`Instagram Auto-Check initialisiert: ${ids.length} Posts gespeichert.`);
        } else {
          const seen = new Set(state.instagram);
          const newPosts = posts.filter(p => !seen.has(String(p.id))).reverse();
          for (const post of newPosts) {
            await announceDetectedSocial(guild, "instagram", post);
          }
          if (newPosts.length) {
            state.instagram = [...ids, ...state.instagram].filter((id, i, arr) => arr.indexOf(id) === i).slice(0, 50);
            changed = true;
            console.log(`Instagram Auto-Check: ${newPosts.length} neuer Post / neue Posts erkannt.`);
          }
        }
      }
    } catch (err) {
      console.error("Instagram Auto-Check Fehler:", err.message || err);
    }
  }

  if (TIKTOK_ACCESS_TOKEN || (TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && TIKTOK_REDIRECT_URI)) {
    try {
      const posts = await fetchTikTokPosts(guild);
      if (posts) {
        const ids = posts.map(p => String(p.id));

        if (!state.tiktokInitialized) {
          // First successful TikTok sync: mark the baseline. If a video already exists,
          // announce only the newest one once so the first real test post is not swallowed.
          if (posts.length) {
            const newest = [...posts].sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0))[0];
            await announceDetectedSocial(guild, "tiktok", newest);
            console.log("TikTok Auto-Check: erstes erkanntes Video einmalig angekündigt.");
          } else {
            console.log("TikTok Auto-Check initialisiert: aktuell 0 Videos.");
          }

          state.tiktok = ids;
          state.tiktokInitialized = true;
          changed = true;
        } else {
          const seen = new Set(state.tiktok);
          const newPosts = posts.filter(p => !seen.has(String(p.id))).reverse();

          for (const post of newPosts) {
            await announceDetectedSocial(guild, "tiktok", post);
          }

          if (newPosts.length) {
            state.tiktok = [...ids, ...state.tiktok]
              .filter((id, i, arr) => arr.indexOf(id) === i)
              .slice(0, 50);
            changed = true;
            console.log(`TikTok Auto-Check: ${newPosts.length} neues Video / neue Videos erkannt.`);
          }
        }
      }
    } catch (err) {
      console.error("TikTok Auto-Check Fehler:", err.message || err);
    }
  }

  if (changed) await saveSocialState(state);
}

async function sendWelcome(member) {
  const memberRole = member.guild.roles.cache.find(r => r.name === "👤 Member");
  if (memberRole) await member.roles.add(memberRole).catch(() => null);

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
    new ButtonBuilder().setLabel("VANTHEN SHOP").setStyle(ButtonStyle.Link).setURL(WEBSITE_URL)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

function giveawayMarker(messageId) {
  return `VANTHEN_GIVEAWAY:${messageId}:`;
}

async function saveGiveawayState(guild, state, stateMessage = null) {
  const channel = await ensureBotStateChannel(guild);
  const content = giveawayMarker(state.messageId) + JSON.stringify(state);

  if (stateMessage) {
    await stateMessage.edit(content);
    return stateMessage;
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const existing = messages?.find(m => m.content.startsWith(giveawayMarker(state.messageId)));
  if (existing) {
    await existing.edit(content);
    return existing;
  }

  return channel.send(content);
}

async function loadGiveawayState(guild, messageId) {
  const channel = await ensureBotStateChannel(guild);
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const msg = messages?.find(m => m.content.startsWith(giveawayMarker(messageId)));
  if (!msg) return null;

  try {
    return {
      stateMessage: msg,
      state: JSON.parse(msg.content.slice(giveawayMarker(messageId).length))
    };
  } catch {
    return null;
  }
}

function giveawayEmbed(state, ended = false) {
  const endUnix = Math.floor(state.endsAt / 1000);
  const entrants = state.entrants?.length || 0;

  const embed = new EmbedBuilder()
    .setColor(ended ? COLORS.red : COLORS.purple)
    .setTitle(ended ? "🎉 GIVEAWAY BEENDET" : "🎉 VANTHEN GIVEAWAY")
    .setDescription(
      `**Gewinn:** ${state.prize}\n\n` +
      `**Gewinner:** ${state.winnerCount}\n` +
      `**Teilnehmer:** ${entrants}\n` +
      (ended
        ? "\nDas Giveaway ist beendet."
        : `**Ende:** <t:${endUnix}:F> (<t:${endUnix}:R>)\n\nKlicke auf **Teilnehmen**.`)
    )
    .setFooter({ text: "VANTHEN • NOT MADE TO BELONG." });

  if (!ended) embed.setTimestamp(state.endsAt);
  return embed;
}

async function updateGiveawayMessage(guild, state, ended = false) {
  const channel = await guild.channels.fetch(state.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const message = await channel.messages.fetch(state.messageId).catch(() => null);
  if (!message) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter:${state.messageId}`)
      .setLabel(ended ? "Giveaway beendet" : "Teilnehmen")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success)
      .setDisabled(ended)
  );

  await message.edit({ embeds: [giveawayEmbed(state, ended)], components: [row] });
}

async function endGiveaway(guild, messageId) {
  const loaded = await loadGiveawayState(guild, messageId);
  if (!loaded || loaded.state.ended) return;

  const state = loaded.state;
  state.ended = true;

  const pool = [...new Set(state.entrants || [])];
  const winners = [];
  const winnerCount = Math.min(state.winnerCount, pool.length);

  while (winners.length < winnerCount && pool.length) {
    const idx = crypto.randomInt(pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  state.winners = winners;
  await saveGiveawayState(guild, state, loaded.stateMessage);
  await updateGiveawayMessage(guild, state, true);

  const channel = await guild.channels.fetch(state.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    if (winners.length) {
      await channel.send(
        `🎉 Glückwunsch ${winners.map(id => `<@${id}>`).join(", ")}! Ihr habt **${state.prize}** gewonnen. Bitte eröffnet ein Support-Ticket für die Abwicklung.`
      );
    } else {
      await channel.send(`Das Giveaway **${state.prize}** ist beendet, aber es gab keine Teilnehmer.`);
    }
  }

  const timer = scheduledGiveaways.get(messageId);
  if (timer) clearTimeout(timer);
  scheduledGiveaways.delete(messageId);
}

function scheduleGiveaway(guild, state) {
  const messageId = state.messageId;
  const delay = state.endsAt - Date.now();

  const old = scheduledGiveaways.get(messageId);
  if (old) clearTimeout(old);

  if (delay <= 0) {
    endGiveaway(guild, messageId).catch(console.error);
    return;
  }

  const timer = setTimeout(() => {
    endGiveaway(guild, messageId).catch(console.error);
  }, Math.min(delay, 2147483647));

  scheduledGiveaways.set(messageId, timer);
}

async function restoreGiveaways(guild) {
  const channel = await ensureBotStateChannel(guild);
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  for (const msg of messages.values()) {
    if (!msg.content.startsWith("VANTHEN_GIVEAWAY:")) continue;

    const parts = msg.content.split(":");
    const messageId = parts[1];
    try {
      const state = JSON.parse(msg.content.slice(giveawayMarker(messageId).length));
      if (!state.ended) scheduleGiveaway(guild, state);
    } catch {}
  }
}

async function createGiveawayCommand(interaction) {
  const channel = findTextChannel(interaction.guild, "giveaways");
  if (!channel) {
    return interaction.reply({ content: "#giveaways wurde nicht gefunden.", ephemeral: true });
  }

  const prize = interaction.options.getString("preis", true);
  const minutes = interaction.options.getInteger("minuten", true);
  const winnerCount = interaction.options.getInteger("gewinner", true);

  const provisional = {
    messageId: "",
    channelId: channel.id,
    prize,
    endsAt: Date.now() + minutes * 60 * 1000,
    winnerCount,
    entrants: [],
    winners: [],
    ended: false
  };

  const message = await channel.send({ embeds: [giveawayEmbed(provisional, false)] });
  provisional.messageId = message.id;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter:${message.id}`)
      .setLabel("Teilnehmen")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success)
  );

  await message.edit({ embeds: [giveawayEmbed(provisional, false)], components: [row] });
  await saveGiveawayState(interaction.guild, provisional);
  scheduleGiveaway(interaction.guild, provisional);

  await interaction.reply({ content: `✅ Giveaway erstellt: ${message.url}`, ephemeral: true });
}

async function handleGiveawayEntry(interaction, messageId) {
  const loaded = await loadGiveawayState(interaction.guild, messageId);
  if (!loaded) {
    return interaction.reply({ content: "Dieses Giveaway konnte nicht gefunden werden.", ephemeral: true });
  }

  const state = loaded.state;
  if (state.ended || Date.now() >= state.endsAt) {
    await endGiveaway(interaction.guild, messageId).catch(() => null);
    return interaction.reply({ content: "Dieses Giveaway ist bereits beendet.", ephemeral: true });
  }

  state.entrants = Array.isArray(state.entrants) ? state.entrants : [];
  const index = state.entrants.indexOf(interaction.user.id);

  let joined;
  if (index >= 0) {
    state.entrants.splice(index, 1);
    joined = false;
  } else {
    state.entrants.push(interaction.user.id);
    joined = true;
  }

  await saveGiveawayState(interaction.guild, state, loaded.stateMessage);
  await updateGiveawayMessage(interaction.guild, state, false);

  await interaction.reply({
    content: joined ? "✅ Du nimmst am Giveaway teil." : "❌ Deine Teilnahme wurde entfernt.",
    ephemeral: true
  });
}

async function postManualAnnouncement(interaction, kind) {
  const product = interaction.options.getString("produkt", true);
  await sendDropAnnouncement(interaction.guild, [product], kind);
  await interaction.reply({ content: "✅ Ankündigung wurde veröffentlicht.", ephemeral: true });
}

async function postSocial(interaction) {
  const platform = interaction.options.getString("plattform", true);
  const url = interaction.options.getString("url", true);
  const text = interaction.options.getString("text") || "Neuer VANTHEN Content ist online.";

  const channelName = platform === "tiktok" ? "tiktok" : "instagram";
  const channel = findTextChannel(interaction.guild, channelName);
  if (!channel) {
    return interaction.reply({ content: `#${channelName} wurde nicht gefunden.`, ephemeral: true });
  }

  const role = interaction.guild.roles.cache.find(r => r.name === "📱 Social Alerts");
  const embed = new EmbedBuilder()
    .setColor(platform === "tiktok" ? COLORS.black : COLORS.purple)
    .setTitle(platform === "tiktok" ? "🎵 NEW VANTHEN TIKTOK" : "📸 NEW VANTHEN INSTAGRAM POST")
    .setDescription(text)
    .setURL(url)
    .setFooter({ text: "VANTHEN • SOCIAL" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(platform === "tiktok" ? "TIKTOK ÖFFNEN" : "INSTAGRAM ÖFFNEN")
      .setStyle(ButtonStyle.Link)
      .setURL(url)
  );

  await channel.send({
    content: role ? `<@&${role.id}>` : undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: role ? { roles: [role.id] } : undefined
  });

  await interaction.reply({ content: "✅ Social-Ankündigung veröffentlicht.", ephemeral: true });
}

async function manageAccessRole(interaction, roleName) {
  const action = interaction.options.getString("aktion", true);
  const user = interaction.options.getUser("mitglied", true);
  const member = await interaction.guild.members.fetch(user.id);
  const role = interaction.guild.roles.cache.find(r => r.name === roleName);

  if (!role) {
    return interaction.reply({ content: `Rolle ${roleName} wurde nicht gefunden.`, ephemeral: true });
  }

  if (action === "add") {
    await member.roles.add(role);
    await interaction.reply({ content: `✅ ${user} hat jetzt **${roleName}**.`, ephemeral: true });
  } else {
    await member.roles.remove(role);
    await interaction.reply({ content: `✅ **${roleName}** wurde bei ${user} entfernt.`, ephemeral: true });
  }
}

async function postEarlyAccess(interaction) {
  const text = interaction.options.getString("text", true);
  const url = interaction.options.getString("url") || WEBSITE_URL;
  const channel = findTextChannel(interaction.guild, "early-access");
  const role = interaction.guild.roles.cache.find(r => r.name === "🔥 Early Access");

  if (!channel) {
    return interaction.reply({ content: "#early-access wurde nicht gefunden.", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.navy)
    .setTitle("🔥 VANTHEN EARLY ACCESS")
    .setDescription(text)
    .setURL(url)
    .setFooter({ text: "EARLY ACCESS • VANTHEN" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("EARLY ACCESS").setStyle(ButtonStyle.Link).setURL(url)
  );

  await channel.send({
    content: role ? `<@&${role.id}>` : undefined,
    embeds: [embed],
    components: [row],
    allowedMentions: role ? { roles: [role.id] } : undefined
  });

  await interaction.reply({ content: "✅ Early-Access-Post veröffentlicht.", ephemeral: true });
}

async function registerCommands(guild) {
  const adminPerm = PermissionFlagsBits.ManageGuild;

  const commands = [
    new SlashCommandBuilder()
      .setName("drop")
      .setDescription("Veröffentlicht eine VANTHEN Drop-Ankündigung")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o => o.setName("produkt").setDescription("Produktname").setRequired(true)),

    new SlashCommandBuilder()
      .setName("restock")
      .setDescription("Veröffentlicht eine VANTHEN Restock-Ankündigung")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o => o.setName("produkt").setDescription("Produktname").setRequired(true)),

    new SlashCommandBuilder()
      .setName("soldout")
      .setDescription("Markiert ein Produkt als sold out")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o => o.setName("produkt").setDescription("Produktname").setRequired(true)),

    new SlashCommandBuilder()
      .setName("social")
      .setDescription("Veröffentlicht einen Social-Media-Post im Discord")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o =>
        o.setName("plattform").setDescription("Plattform").setRequired(true)
          .addChoices(
            { name: "Instagram", value: "instagram" },
            { name: "TikTok", value: "tiktok" }
          )
      )
      .addStringOption(o => o.setName("url").setDescription("Link zum Post").setRequired(true))
      .addStringOption(o => o.setName("text").setDescription("Beschreibung").setRequired(false)),

    new SlashCommandBuilder()
      .setName("giveaway")
      .setDescription("Startet ein VANTHEN Giveaway")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o => o.setName("preis").setDescription("Was wird verlost?").setRequired(true))
      .addIntegerOption(o =>
        o.setName("minuten").setDescription("Dauer in Minuten").setRequired(true).setMinValue(1).setMaxValue(20160)
      )
      .addIntegerOption(o =>
        o.setName("gewinner").setDescription("Anzahl der Gewinner").setRequired(true).setMinValue(1).setMaxValue(10)
      ),

    new SlashCommandBuilder()
      .setName("vip")
      .setDescription("Verwaltet die VANTHEN VIP-Rolle")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o =>
        o.setName("aktion").setDescription("Hinzufügen oder entfernen").setRequired(true)
          .addChoices({ name: "Hinzufügen", value: "add" }, { name: "Entfernen", value: "remove" })
      )
      .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true)),

    new SlashCommandBuilder()
      .setName("earlyaccess")
      .setDescription("Verwaltet die Early-Access-Rolle")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o =>
        o.setName("aktion").setDescription("Hinzufügen oder entfernen").setRequired(true)
          .addChoices({ name: "Hinzufügen", value: "add" }, { name: "Entfernen", value: "remove" })
      )
      .addUserOption(o => o.setName("mitglied").setDescription("Mitglied").setRequired(true)),

    new SlashCommandBuilder()
      .setName("earlypost")
      .setDescription("Postet eine exklusive Early-Access-Nachricht")
      .setDefaultMemberPermissions(adminPerm)
      .addStringOption(o => o.setName("text").setDescription("Nachricht").setRequired(true))
      .addStringOption(o => o.setName("url").setDescription("Optionaler Link").setRequired(false))
  ].map(c => c.toJSON());

  await guild.commands.set(commands);
  console.log(`✓ ${commands.length} Slash-Commands registriert.`);
}

client.once("ready", async () => {
  try {
    console.log(`Angemeldet als ${client.user.tag}`);
    client.user.setActivity("NOT MADE TO BELONG.");

    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();
    await guild.channels.fetch();

    await setupPanels(guild);
    await registerCommands(guild);
    await checkForProductChanges(guild);
    await checkForSocialPosts(guild);
    await restoreGiveaways(guild);

    setInterval(() => {
      checkForProductChanges(guild).catch(err => console.error("Produkt-Check Intervall:", err));
    }, DROP_CHECK_MINUTES * 60 * 1000);

    setInterval(() => {
      checkForSocialPosts(guild).catch(err => console.error("Social-Check Intervall:", err));
    }, SOCIAL_CHECK_MINUTES * 60 * 1000);

    console.log("\n✅ VANTHEN Community Bot PRO ist online.");
    console.log(`Produkt-/Restock-Check: alle ${DROP_CHECK_MINUTES} Minuten.`);
    console.log(`Social Auto-Check: alle ${SOCIAL_CHECK_MINUTES} Minuten.`);
    console.log(`Instagram Auto: ${INSTAGRAM_ACCESS_TOKEN ? "BEREIT (User-ID automatisch)" : "WARTET AUF TOKEN"}.`);
    console.log(`TikTok OAuth: ${TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET && TIKTOK_REDIRECT_URI ? "BEREIT" : TIKTOK_ACCESS_TOKEN ? "LEGACY TOKEN AKTIV" : "WARTET AUF CLIENT KEY/SECRET"}.`);
    console.log(`Automatische Welcome-Nachrichten: ${ENABLE_MEMBER_WELCOME ? "AKTIV" : "DEAKTIVIERT"}.`);
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
      if (interaction.customId === "role_drop_alerts") return toggleRole(interaction, "🔔 Drop Alerts");
      if (interaction.customId === "role_restock_alerts") return toggleRole(interaction, "📦 Restock Alerts");
      if (interaction.customId === "role_social_alerts") return toggleRole(interaction, "📱 Social Alerts");
      if (interaction.customId === "ticket_claim") return claimTicket(interaction);
      if (interaction.customId === "ticket_close") return closeTicket(interaction);
      if (interaction.customId.startsWith("giveaway_enter:")) {
        return handleGiveawayEntry(interaction, interaction.customId.split(":")[1]);
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_type") {
      return createTicket(interaction, interaction.values[0] || "other");
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "drop") return postManualAnnouncement(interaction, "drop");
      if (interaction.commandName === "restock") return postManualAnnouncement(interaction, "restock");
      if (interaction.commandName === "soldout") return postManualAnnouncement(interaction, "soldout");
      if (interaction.commandName === "social") return postSocial(interaction);
      if (interaction.commandName === "giveaway") return createGiveawayCommand(interaction);
      if (interaction.commandName === "vip") return manageAccessRole(interaction, "⭐ VIP");
      if (interaction.commandName === "earlyaccess") return manageAccessRole(interaction, "🔥 Early Access");
      if (interaction.commandName === "earlypost") return postEarlyAccess(interaction);
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

tiktokOAuth.startServer();
client.login(TOKEN);
