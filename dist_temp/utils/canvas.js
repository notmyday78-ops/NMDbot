"use strict";
import { createCanvas, loadImage } from "canvas";
export async function generateWelcomeImage(member, backgroundUrl) {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext("2d");
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#8b5cf6");
    gradient.addColorStop(1, "#3b82f6");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const avatarSize = 150;
  const avatarX = 50;
  const avatarY = (canvas.height - avatarSize) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImage(avatarUrl);
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText("WELCOME", 230, 110);
  ctx.font = "bold 54px sans-serif";
  const username = member.user.username;
  ctx.fillText(username, 230, 175);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(`You are member #${member.guild.memberCount}`, 230, 225);
  return canvas.toBuffer();
}
export async function generateGoodbyeImage(member, backgroundUrl) {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext("2d");
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      ctx.fillStyle = "#1e1e2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#f43f5e");
    gradient.addColorStop(1, "#9f1239");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const avatarSize = 150;
  const avatarX = 50;
  const avatarY = (canvas.height - avatarSize) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.clip();
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
  const avatar = await loadImage(avatarUrl);
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#9ca3af";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText("GOODBYE", 230, 110);
  ctx.font = "bold 54px sans-serif";
  const username = member.user.username;
  ctx.fillText(username, 230, 175);
  ctx.font = "28px sans-serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(`We are now at ${member.guild.memberCount} members`, 230, 225);
  return canvas.toBuffer();
}
