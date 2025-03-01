import { ActionRowBuilder, SlashCommandBuilder, ModalBuilder,
    TextInputBuilder, EmbedBuilder, TextInputStyle, } from "discord.js";

import * as logs from "#src/modules/logs";
import * as database from "#src/modules/database";
import colors from "#src/consts/colors";
import { getMember } from "#src/modules/discord";
import {message} from "#src/factories/styledEmbed";
import {string, templateString} from "#src/agents/stringAgent";

export function init() {
    return new SlashCommandBuilder()
        .setName("birthday")
        .setDescription("View and save birthdays")
        .addSubcommand(subcommand => subcommand
            .setName('add')
            .setDescription("Add your birthday")
        )
        .addSubcommand(subcommand => subcommand
            .setName('get')
            .setDescription("Get someone's birthday")
            .addUserOption(option => option
                .setName('user')
                .setDescription('The user whose birthday you want to see')
                .setRequired(true)
            )
        )
        .addSubcommand(subcommand => subcommand
            .setName('next')
            .setDescription("See the next birthday(s)")
            .addIntegerOption(option => option
                .setName('count')
                .setDescription('The number of birthdays to view')
                .setMinValue(1).setMaxValue(10)
            )
        )
}

const emojiIcons = {
    home:   'https://portalmod.net/images/icons/home.png',
    mark:   'https://portalmod.net/images/icons/mark.png',
    events: 'https://portalmod.net/images/icons/events.png',
}

const title = "Phanty's Home Birthdays";
const formTitle = {
  name: "Phanty's Home Birthdays",
  iconURL: emojiIcons.home
};

// Form
const form = new ModalBuilder()
    .setCustomId("commands.birthday#birthday")
    .setTitle(formTitle.name);

const birthdayInput = new TextInputBuilder()
    .setCustomId("birthday")
    .setLabel("Enter your birthday: (This is permanent!)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("DD-MM-YYYY or DD-MM")
    .setRequired(true)
    .setMaxLength(10);

form.addComponents(new ActionRowBuilder().addComponents(birthdayInput));

// Cap a string str at len length
function trimString(str, len) {
    return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// Returns Date from "dd-mm[-yyyy]" format
function parseDate(input) {
    const matches = input.match(/^(\d{2})-(\d{2})(?:-(\d{4}))?$/);
    if (!matches) return null;

    let [_, day, month, year] = matches;
    day   = parseInt(day);
    month = parseInt(month);
    year  = year ? parseInt(year) : 0;
    
    const date = new Date(year, month - 1, day);

    if (date.getDate() != day || date.getMonth() != month - 1) return null;
    date.setHours(12, 0, 0, 0); // Fix off by one?

    return date;
}

// Returns date in human-readable format
function formatDate(date, includeYear) {
    const months = ["January", "February", "March", "April", "May", "June", 
        "July", "August", "September", "October", "November", "December"];

    const day   = date.getDate();
    const month = months[date.getMonth()];
    const year  = date.getFullYear();

    const suffix = 
        (day % 10 === 1 && day !== 11) ? "st" :
        (day % 10 === 2 && day !== 12) ? "nd" :
        (day % 10 === 3 && day !== 13) ? "rd" : "th";

    return (year === 1900 || !includeYear) ? `${month} ${day}${suffix}` : `${month} ${day}${suffix} ${year}`;
}

// Returns true if today is the input date
function birthdayIsToday(date) {
    const today = new Date();
    return date.getDate()  === today.getDate() &&
           date.getMonth() === today.getMonth();
}

// Returns the number of days until the input birthday
function daysUntilBirthday(birthday) {
    const today = new Date();
    const birthdayMonth = birthday.getMonth();
    const birthdayDay   = birthday.getDate();
    
    let nextBirthday = new Date(today.getFullYear(), birthdayMonth, birthdayDay);

    // If birthday has passed, adjust to next year
    if (today > nextBirthday) {
        nextBirthday.setFullYear(today.getFullYear() + 1);
    }

    return Math.ceil((nextBirthday - today) / 86400000); // Divide by number of ms per day
}

// Format row details
async function getUserDetails(users) {
    const usernames     = [];
    const dates         = [];
    const daysRemaining = [];
    let lastMember;

    for (const user of users) {
        try {
            const member = await getMember(user.discord_id);

            if (!member) continue;

            if (!lastMember) lastMember = member;

            const displayName   = member.nickname || member.user.globalName;
            const formattedDate = formatDate(user.birthday, false);
            const remainingDays = daysUntilBirthday(user.birthday);

            usernames.push(trimString(displayName, 20));
            dates.push(formattedDate);
            daysRemaining.push(remainingDays);
        } catch (error) {
            await logs.logError("indexing birthdays", error)
        }
    }

    return { usernames, dates, daysRemaining, lastMember };
}

export async function react(interaction) {
    // Birthday Add command
    if (interaction.options.getSubcommand() === "add") {
        const userBirthday = await database.getBirthday(interaction.user.id);

        if (!userBirthday) {
            await interaction.showModal(form);
            return;
        }

        interaction.reply(message(
            await templateString("birthday.add.duplicate", [ formatDate(userBirthday, true) ]),
            "birthday • duplicate",
            title,
            colors.Error,
            true
        ));
        return;
    }

    // Birthday Get command
    if (interaction.options.getSubcommand() === "get") {
        const birthdayUser = interaction.options.getUser("user");
        const userBirthday = await database.getBirthday(birthdayUser.id);

        if (userBirthday) {
            interaction.reply(message(
                await templateString("birthday.get.success", [
                        `<@${birthdayUser.id}>`,
                        daysUntilBirthday(userBirthday) % 365,
                        birthdayIsToday(userBirthday) ? "Today! 🎉" : formatDate(userBirthday, true)]),
                "birthday • success",
                title,
                colors.Primary,
                false,
                birthdayUser.displayAvatarURL()
            ));
        } else {
            interaction.reply(message(
                await templateString("birthday.get.unknown", [`<@${birthdayUser.id}>`]),
                "birthday • not found",
                title,
                colors.Primary,
                false,
                birthdayUser.displayAvatarURL()
            ));
        }
        return;
    }

    // Birthday next command
    if (interaction.options.getSubcommand() === "next") {
        interaction.deferReply();
        const birthdayCount = interaction.options.getInteger("count") || 1;
        const nextBirthdays = await database.getNextBirthdays(50);

        const entries = await getUserDetails(nextBirthdays);

        if (birthdayCount === 1) {
            let url = emojiIcons.mark;
            let name = entries.usernames[0];
            try {
                url = entries.lastMember.displayAvatarURL();
                name = `<@${entries.lastMember.id}>`;
            } catch {}

            await interaction.editReply(message(
                await templateString("birthday.next.single", [name, entries.daysRemaining[0], entries.daysRemaining[0] === 0 ? "Today! 🎉" : entries.dates[0]]),
                "birthday • success",
                title,
                colors.Primary,
                false,
                url
            ));

        } else {
            let nr = Math.min(birthdayCount, entries.usernames.length);

            await interaction.editReply(message(
                await templateString("birthday.next.multiple", [nr]),
                `birthday • next ${nr}`,
                title,
                colors.Primary,
                false,
                emojiIcons.home,
                [
                    { name: '**Name:**',      value: `**\`\`\`\n${entries.usernames.slice(0, birthdayCount).join('\n')    }\n\`\`\`**`, inline: true },
                    { name:   'Date:',        value:   `\`\`\`\n${entries.dates.slice(0, birthdayCount).join('\n')        }\n\`\`\``,   inline: true },
                    { name:   'Days left:',   value:   `\`\`\`\n${entries.daysRemaining.slice(0, birthdayCount).join('\n')}\n\`\`\``,   inline: true }
                ]
            ));
        }
    }
}

export async function modalSubmitted(formID, interaction) {
    if (formID === "birthday") {
        const birthDate = await parseDate(interaction.fields.getTextInputValue('birthday'));

        // Valid input
        if (birthDate) {
            await database.saveBirthday(interaction.user.id, birthDate);
            logs.logMessage(`🍰 Saved birthday of \`${interaction.user}\`: ${formatDate(birthDate, true)}`);

            interaction.reply(message(
                await templateString("birthday.add.success", [formatDate(birthDate, true)]),
                "birthday • success",
                title,
                colors.Calendar,
                false,
                emojiIcons.events
            ));

        } else {
            interaction.reply(message(
                await string("birthday.add.syntax"),
                "birthday • incorrect format",
                title,
                colors.Error,
                true,
                emojiIcons.mark
            ));
        }
    }
}
