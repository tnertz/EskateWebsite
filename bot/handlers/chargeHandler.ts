import { v4 } from 'uuid';
import { Context, NarrowedContext, Scenes, Types } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { addChargeSpot, updateUser } from '../utils/dbHandler';
import { ChargeSpot, ChargeSteps, ChargeType, UserData } from '../utils/types';

export const handleAddCharge = async () => {};
export const handleGetCharge = async () => {};

const processLocation = () => {};

// how to handle:
// Input Validation
// save info to

export const charge = async (
  ctx: NarrowedContext<Context<Update>, Types.MountMap['message']>,
  next: () => Promise<void>,
  user: UserData,
) => {
  await ctx.replyWithChatAction('typing');

  if (!user.conversationalStep || !user.conversationalStep.state) {
    return await ctx.reply('Something went wrong.');
  }
  const step = user.conversationalStep.stepInfo;

  if (step === ChargeSteps.Location) {
    if (!('location' in ctx.message)) {
      user.conversationalStep = undefined;
      await updateUser(user);
      return await ctx.reply(
        "I'm waiting for a location of a charge spot. To try again, send /add",
      );
    }

    user.conversationalStep.state.lat = ctx.message.location.latitude;
    user.conversationalStep.state.lon = ctx.message.location.longitude;
    user.conversationalStep.stepInfo = ChargeSteps.Type;
    await updateUser(user);

    return await ctx.reply(
      'Thanks! Is this charge location indoors? (yes, no)',
    );
  }
  if (step === ChargeSteps.Type) {
    if (!('text' in ctx.message)) {
      user.conversationalStep = undefined;
      await updateUser(user);
      return await ctx.reply(
        "I'm waiting for a 'yes' or a 'no' if the charge location is indoors or not. To try again, send /add",
      );
    }

    const msg = ctx.message.text.toLowerCase();
    const indoors = msg.includes('yes');

    user.conversationalStep.state.indoors = indoors
      ? ChargeType.INDOOR
      : ChargeType.OUTDOOR;
    user.conversationalStep.stepInfo = ChargeSteps.Description;
    await updateUser(user);

    return await ctx.reply(
      `Sweet. I've got that as ${
        indoors ? 'indoors' : 'outdoors'
      }. Last step, send a quick description of where this location is. For example, is it inside a business? on a light pole? etc`,
    );
  }
  if (step === ChargeSteps.Description) {
    if (!('text' in ctx.message)) {
      user.conversationalStep = undefined;
      await updateUser(user);
      return await ctx.reply(
        "I'm waiting for a description of the charge location. To try again, send /add",
      );
    }

    user.conversationalStep.state.description = ctx.message.text;

    const data: ChargeSpot = {
      id: v4(),
      chargeType: user.conversationalStep.state.indoors,
      lat: user.conversationalStep.state.lat,
      lon: user.conversationalStep.state.lon,
      description: user.conversationalStep.state.description,
      userAdded: ctx.from.id,
    };

    await addChargeSpot(data);

    user.conversationalStep = undefined;
    await updateUser(user);

    return await ctx.reply(
      'Thanks! Your charge location has been added to the database',
    );
  }

  return await ctx.reply('Something went wrong.');
};
