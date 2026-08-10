import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 账号规则：登录用户名 = 公司（TUV）邮箱；登录密码 = 个人邮箱
// 运行该脚本会为列表中的账号创建或重置为上述规则（重复运行安全）
const accounts = [
  { name: "Wendy Ding", email: "wendy.ding@tuv.com", personalEmail: "dingruhao90@126.com" },
  { name: "Menny Zhang", email: "menny.zhang@tuv.com", personalEmail: "menny_zhang@hotmail.com" },
  { name: "Eunice Wu", email: "eunice.wu@tuv.com", personalEmail: "eunicesagan@sina.com" },
  { name: "Betsy Wang", email: "betsy.wang@tuv.com", personalEmail: "betsy.wang@tuv.com" },
  { name: "Jancy Meng", email: "jancy.meng@tuv.com", personalEmail: "331729106@qq.com" },
  { name: "Eric Li", email: "ericqm.li@tuv.com", personalEmail: "ericlee_semir@163.com" },
  { name: "Sally Zhang", email: "sallyzy.zhang@tuv.com", personalEmail: "303345547@qq.com" },
  { name: "Flora Xu", email: "2405520865@qq.com", personalEmail: "2405520865@qq.com" },
  { name: "David Ni", email: "david.ni@tuv.com", personalEmail: "niyinbin@163.com" },
  { name: "Tony Lv", email: "tony.lv@tuv.com", personalEmail: "tony_lv@msn.com" },
  { name: "Julie Xu", email: "Julie.Xu@tuv.com", personalEmail: "JiayiXu0923@163.com" },
  { name: "Simon Hung", email: "simon.hung@tuv.com", personalEmail: "simonhks2001@yahoo.com.hk" },
  { name: "Yuki Ye", email: "yuki.ye@tuv.com", personalEmail: "yuki.aki-j@tuv.com" },
  { name: "Jane Liang", email: "Jane.Liang@tuv.com", personalEmail: "Jane.Liang@tuv.com" },
  { name: "Wenlin Leng", email: "Wenlin.Leng@tuv.com", personalEmail: "lengwenlin@outlook.com" },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const a of accounts) {
    const email = a.email.toLowerCase().trim();
    const password = a.personalEmail.trim();
    const hash = await bcrypt.hash(password, 10);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      await prisma.user.update({
        where: { email },
        data: { name: a.name.trim(), passwordHash: hash },
      });
      updated++;
      console.log(`已更新: ${a.name} <${email}>（密码已重置为个人邮箱）`);
    } else {
      await prisma.user.create({
        data: {
          name: a.name.trim(),
          email,
          passwordHash: hash,
          role: "user",
          active: true,
        },
      });
      created++;
      console.log(`已创建: ${a.name} <${email}>（密码=个人邮箱）`);
    }
  }
  console.log(`完成：新增 ${created} 个，更新 ${updated} 个（规则：用户名=公司邮箱，密码=个人邮箱）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
