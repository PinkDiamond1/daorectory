import discordClient from './discord-client';
import {
  createDaoDid,
  createDaoProfileVc,
  createKudosVc,
  createPunkProfileVc, createSecondedKudosVc, findSecondedKudos,
} from '../veramo/did-manager';
import { userMention } from '@discordjs/builders';
import { GuildChannel, Message, MessageEmbed } from 'discord.js';
import _ from 'lodash';

console.log('Starting Daemon Discord bot...');

discordClient.on('ready', async () => {
  console.log('Daemon Discord client is ready to receive commands');

  try {
    await Promise.all(discordClient.guilds.cache.map(async (guild) => {
      console.log(`Getting or creating DID for ${guild.name}/${guild.id}`);
      const vc = await createDaoProfileVc(guild.id, {
        name: guild.name,
        discordId: guild.id,
        avatarUrl: guild.iconURL({ size: 512 }),
      });
      console.log(vc);
    }));
    console.log('Finished creating DIDs/VCs for all guilds');
  } catch(e) {
    console.error('discordClient.ready', e);
  }
});

discordClient.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand() && interaction.inGuild()) {
      const subcommand = interaction.options.getSubcommand();
      switch ([interaction.commandName, subcommand].join('.')) {
        case 'daemon.kudos': {
          const recipientOption = interaction.options.getUser('recipient');
          const message = interaction.options.getString('message');
          const regarding = interaction.options.getString('regarding');

          const recipient = await interaction.guild.members.fetch(recipientOption.id);

          const from = await interaction.guild.members.fetch(interaction.user.id);

          const recipientVc = await createPunkProfileVc(recipient.id, {
            name: recipient.displayName,
            handle: `${recipient.user.username}#${recipient.user.discriminator}`,
            discordId: recipient.id,
            avatarUrl: recipient.user.displayAvatarURL({size: 512}),
          });

          const fromVc = await createPunkProfileVc(from.id, {
            name: from.displayName,
            handle: `${from.user.username}#${from.user.discriminator}`,
            discordId: from.id,
            avatarUrl: from.user.displayAvatarURL({size: 512}),
          });
          console.log(recipientVc, fromVc);

          const channel = interaction.channel as GuildChannel;

          const vc = await createKudosVc(recipient.id, interaction.user.id, interaction.guildId, {
            message,
            description: regarding,
            channel: `#${channel.name}`,
          });

          console.log('Issued kudos VC:', vc);
          const kudosMessage = await interaction.reply({
            content: `Kudos! ${userMention(recipient.id)}\n\nReact with :+1: to second!`,
            embeds: [
              new MessageEmbed()
                .setTitle(message)
                .setDescription(regarding)
                .setThumbnail(recipient.user.avatarURL())
                .addField('From', userMention(interaction.user.id))
                .addField('KudosID', vc.credentialSubject.credentialId)
                .setTimestamp(),
            ],
            fetchReply: true,
          });
          if (kudosMessage instanceof Message) {
            await kudosMessage.react('👍');
          }
          break;
        }
        default: {
          await interaction.reply({
            content: 'Unknown interaction',
            ephemeral: true,
          });
        }
      }
    }
  } catch(e) {
    console.error('discordClient.interactionCreate', e);
  }
});

discordClient.on('messageReactionAdd', async (messageReaction) => {
  try {
    if (messageReaction.partial) {
      await messageReaction.fetch();
    }
    console.log('messageReactionAdd', messageReaction);

    if (!messageReaction.message.embeds?.length) {
      console.log('Missing embed');
      return;
    }

    const [embed] = messageReaction.message.embeds;
    const kudosIdField = embed.fields.find(f => f.name === 'KudosID');
    if (!kudosIdField) {
      console.log('Missing kudos ID field');
      return;
    }
    const kudosId = kudosIdField.value;

    await messageReaction.users.fetch();

    const secondedUsers = [...messageReaction.users.cache.keys()].filter(id => id !== discordClient.user.id);
    console.log([...messageReaction.users.cache.values()].map(u => u.displayAvatarURL({ size: 512 })));
    console.log(secondedUsers);

    const secondedKudos = await findSecondedKudos(kudosId);
    const secondedKudosByDiscordId = _.keyBy(secondedKudos, sk => sk.credentialSubject.issuerId);

    await Promise.all(secondedUsers.map(async (userId) => {
      if (secondedKudosByDiscordId[userId]) {
        console.log(`${userId} has already seconded kudos ${kudosId}`);
        return;
      }
      console.log(`Issuing seconded kudos from ${userId} for kudos ${kudosId}`);
      await createSecondedKudosVc(userId, kudosId);
    }));
  } catch(e) {
    console.error('discordClient.messageReactionAdd', e);
  }
});

discordClient.on('guildJoin', async (guild) => {
  try {
    // Issue guild DID and Profile VC
    console.log(`Creating DID for ${guild.name}/${guild.id}`);
    await createDaoProfileVc(guild.id, {
      name: guild.name,
      discordId: guild.id,
      avatarUrl: guild.iconURL({ size: 512 }),
    });
  } catch(e) {
    console.error('discordClient.guildJoin', e);
  }
});
