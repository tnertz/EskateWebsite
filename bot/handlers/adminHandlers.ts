import moment from 'moment-timezone';
import { Context, NarrowedContext, Types } from 'telegraf';
import { Update, User } from 'telegraf/typings/core/types/typegram';
import { getUserById, tgToDbUser, updateUser } from './dbHandlers';
import { GROUP_IDS, MAIN_GROUP_ID } from '../utils/ids';
import { Warning } from '../utils/types';
import { getGroupRide } from './rideHandlers';

const isAdmin = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  userId: number,
  chatId: number,
): Promise<boolean> => {
  console.log(`testing if ${userId} is admin of ${chatId}`);
  const admins = await ctx.telegram.getChatAdministrators(chatId);
  const filtered = admins.filter((admin) => {
    return admin.user.id === userId;
  });
  console.log(
    `User is ${filtered.length !== 0 ? '' : 'not'} an admin of ${chatId}`,
  );

  console.log('returning ', filtered.length !== 0);
  return filtered.length !== 0;
};

const adminCommandHelper = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
) => {
  const senderId = ctx.from.id;

  if (!(await isAdmin(ctx, senderId, MAIN_GROUP_ID))) {
    console.log(`${senderId} is not an admin`);
    await ctx.reply('Only admins of Chicago Eskate can use this command...');
    return false;
  } else {
    const isReply = !!ctx.message.reply_to_message;
    if (!isReply) {
      console.log(`Improperly used command`);
      await ctx.reply(
        "Reply to the message of the person you'd like to warn...",
      );

      return false;
    } else {
      return true;
    }
  }
};

// Adds a warning to the replied to member
// Automatically bans them if they have 3 or more warnings
// Use: /warn {reason}
// ex: /warn rule 1 ( no helmet )
export const warn = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  if (!(await adminCommandHelper(ctx))) {
    console.log('Someone who was not an admin tried to use the command warn');
    return await next();
  }

  // Create warning
  const reason = ctx.message.text.split(' ').slice(1).join(' ');

  if (reason.trim() === '') {
    return await ctx.reply("Must supply a reason '/warn {reason}");
  }
  const warning: Warning = {
    datetime: moment(moment.now())
      .tz('America/Chicago')
      .format('MMM Do yyyy @ h:mm a'),
    reason: reason,
  };

  // See if user exists in db
  const replyMsg = ctx.message.reply_to_message;
  const repliedUser = replyMsg?.from;
  let user = await getUserById(`${repliedUser?.id}`);
  // If not, create it
  if (!user) {
    user = tgToDbUser(repliedUser as User);
  }
  // Regardless, add a warning and update the user
  user.warnings.push(warning);
  await updateUser(user);

  // If they have too many warnings, ban them
  if (user.warnings.length >= 3) {
    // ctx.kickChatMember(repliedUser?.id || 0);
    await ctx.telegram.kickChatMember(MAIN_GROUP_ID, repliedUser?.id || 0);
    await ctx.telegram.sendMessage(
      MAIN_GROUP_ID,
      `${user.firstname} is now banned for reason ${reason}`,
    );
    for (let id of GROUP_IDS) {
      await ctx.telegram.kickChatMember(id, repliedUser?.id || 0);
      await ctx.telegram.sendMessage(
        id,
        `${user.firstname} is now banned for reason ${reason}`,
      );
      // Add a little wait to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return await next();
  }

  return await ctx.reply(`User now has ${user.warnings.length} warnings`);
};

// Removes the most recent warning to the replied to member
export const unwarn = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  if (!adminCommandHelper(ctx)) return await next();

  // See if user exists in db
  const replyMsg = ctx.message.reply_to_message;
  const repliedUser = replyMsg?.from;
  let user = await getUserById(`${repliedUser?.id}`);
  // If not, create it
  if (!user) {
    user = tgToDbUser(repliedUser as User);
  } else {
    // if so, pop a warning
    user.warnings.pop();
  }

  await updateUser(user);

  return await ctx.reply(`User has ${user.warnings.length} warnings`);
};

// Gets a list of warnings
export const warnings = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  if (!adminCommandHelper(ctx)) return await next();

  // See if user exists in db
  const replyMsg = ctx.message.reply_to_message;
  const repliedUser = replyMsg?.from;
  let user = await getUserById(`${repliedUser?.id}`);
  // If not, create it
  if (!user) {
    user = tgToDbUser(repliedUser as User);
  }
  await updateUser(user);

  const warningsList = user.warnings.map(
    (warning) => `User was warned on ${warning.datetime} for ${warning.reason}`,
  );

  const response =
    warningsList.length === 0
      ? 'User has no warnings'
      : warningsList.join('\n');

  return await ctx.reply(response);
};

// Bans the replied to user
export const ban = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  if (!adminCommandHelper(ctx)) return await next();

  const replyMsg = ctx.message.reply_to_message;
  const repliedUser = replyMsg?.from;
  if (repliedUser === undefined) {
    return await next();
  }

  return await ctx.kickChatMember(repliedUser?.id);
};

// TODO: Shh
export const shh = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  if (!adminCommandHelper(ctx)) return await next();
};

export const shout = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  // Check if sender is admin of main chat
  const senderId = ctx.from.id;
  if (!isAdmin(ctx, senderId, MAIN_GROUP_ID)) {
    return await ctx.reply(
      'Only admins of Chicago Eskate can use this command...',
    );
  }

  const messageText = ctx.message.text.split(' ').slice(1).join(' ');
  await ctx.telegram.sendMessage(MAIN_GROUP_ID, messageText);
  // Send message to every group
  for (let i = 0; i < GROUP_IDS.length; i++) {
    await ctx.telegram.sendMessage(GROUP_IDS[i], messageText);

    // Add a little wait to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return await next();
};

export const announce = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['text']>,
  next: () => Promise<void>,
) => {
  // Check if sender is admin of main chat
  const senderId = ctx.from.id;
  if (!isAdmin(ctx, senderId, MAIN_GROUP_ID)) {
    return await ctx.reply(
      'Only admins of Chicago Eskate can use this command...',
    );
  }

  // Send group ride info to chicago Eskate
  const groupRideString = await getGroupRide();
  const msg = await ctx.telegram.sendMessage(MAIN_GROUP_ID, groupRideString);
  // Post poll to Chicago Eskate
  const poll = await ctx.telegram.sendPoll(
    MAIN_GROUP_ID,
    'Will you make it to this group ride?',
    ['Hell yeah', 'Maybe (Watch the posted live location)', 'Next time...'],
    {
      is_anonymous: false,
    },
  );
  // Forward poll and group ride to every group
  for (let i = 0; i < GROUP_IDS.length; i++) {
    await ctx.telegram.forwardMessage(
      GROUP_IDS[i],
      MAIN_GROUP_ID,
      msg.message_id,
    );
    await ctx.telegram.forwardMessage(
      GROUP_IDS[i],
      MAIN_GROUP_ID,
      poll.message_id,
    );

    // Add a little wait to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return await next();
};
