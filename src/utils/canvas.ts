import { createCanvas, loadImage } from 'canvas';
import { GuildMember } from 'discord.js';
import { getCanvasFontFamily } from './fontLoader';

export async function generateWelcomeImage(
  member: GuildMember,
  backgroundUrl?: string
): Promise<Buffer> {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext('2d');

  // Draw background
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      // Fallback to solid color
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    // Default gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#8b5cf6');
    gradient.addColorStop(1, '#3b82f6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw overlay for better text readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Avatar
  const avatarSize = 150;
  const avatarX = 50;
  const avatarY = (canvas.height - avatarSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();

  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatar = await loadImage(avatarUrl);
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);

  ctx.restore();

  // Draw avatar border
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Text setup
  ctx.fillStyle = '#ffffff';
  const fontFamily = getCanvasFontFamily();

  // Welcome Text
  ctx.font = `bold 42px "${fontFamily}", sans-serif`;
  ctx.fillText('WELCOME', 230, 110);

  // Username
  ctx.font = `bold 54px "${fontFamily}", sans-serif`;
  const username = member.user.username;
  ctx.fillText(username, 230, 175);

  // Member Count
  ctx.font = `28px "${fontFamily}", sans-serif`;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`You are member #${member.guild.memberCount}`, 230, 225);

  return canvas.toBuffer();
}

export async function generateGoodbyeImage(
  member: GuildMember,
  backgroundUrl?: string
): Promise<Buffer> {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext('2d');

  // Draw background
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      // Fallback to solid color
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    // Default gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#f43f5e');
    gradient.addColorStop(1, '#9f1239');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw overlay for better text readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Avatar
  const avatarSize = 150;
  const avatarX = 50;
  const avatarY = (canvas.height - avatarSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();

  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatar = await loadImage(avatarUrl);

  // Make avatar grayscale for goodbye
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);

  ctx.restore();

  // Draw avatar border
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#9ca3af';
  ctx.stroke();

  // Text setup
  ctx.fillStyle = '#ffffff';
  const fontFamily = getCanvasFontFamily();

  // Goodbye Text
  ctx.font = `bold 42px "${fontFamily}", sans-serif`;
  ctx.fillText('GOODBYE', 230, 110);

  // Username
  ctx.font = `bold 54px "${fontFamily}", sans-serif`;
  const usernameMember = member.user.username;
  ctx.fillText(usernameMember, 230, 175);

  // Member Count
  ctx.font = `28px "${fontFamily}", sans-serif`;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`We are now at ${member.guild.memberCount} members`, 230, 225);

  return canvas.toBuffer();
}

export async function generateBirthdayImage(
  username: string,
  avatarUrl: string,
  backgroundUrl?: string
): Promise<Buffer> {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext('2d');

  // Draw background
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      // Fallback to solid color
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    // Default gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#f59e0b');
    gradient.addColorStop(1, '#ea580c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Draw overlay for better text readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Avatar
  const avatarSize = 150;
  const avatarX = 50;
  const avatarY = (canvas.height - avatarSize) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();

  const avatar = await loadImage(avatarUrl);
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);

  ctx.restore();

  // Draw avatar border
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#fbbf24';
  ctx.stroke();

  // Text setup
  ctx.fillStyle = '#ffffff';
  const fontFamily = getCanvasFontFamily();

  // Birthday Text
  ctx.font = `bold 42px "${fontFamily}", sans-serif`;
  ctx.fillText('HAPPY BIRTHDAY', 230, 110);

  // Username
  ctx.font = `bold 54px "${fontFamily}", sans-serif`;
  ctx.fillText(username, 230, 175);

  // Subtitle
  ctx.font = `28px "${fontFamily}", sans-serif`;
  ctx.fillStyle = '#fde68a';
  ctx.fillText(`Hope you have a fantastic day! 🎉`, 230, 225);

  return canvas.toBuffer();
}
