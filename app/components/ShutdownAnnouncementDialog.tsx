"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { shutdownNoticeAfterLoginStorageKey } from "@/lib/shutdown-notice";

const copy = {
  zh: {
    kicker: "服务公告",
    title: "中转站停运与后续转型通知",
    description: "该公告会在登录成功后首次进入控制台时显示一次。",
    close: "我知道了",
    greeting: "各位连接到本站的用户们：",
    phase: "系统核心即将进入最终阶段。本中转站服务将在 2026 年 6 月 8 日停止运行。",
    unlockLead: "在最后的开放周期中，我们将解锁以下模型权限：",
    window: "开放时间：即日起至停运前。请各位在最终倒计时内合理使用。",
    comfort: "但请不要难过。这并不是彻底的消失，而是一次新的重启。",
    future:
      "这个域名将在未来完成形态转换，成为一个全新的论坛社区。新的页面、新的功能、新的交流空间，都将在之后陆续上线。",
    closing: "中转站的故事即将完结。论坛的新篇章，正在启动。",
    thanks: "感谢一路同行，我们新站再见。",
    signature: "—— 管理组",
  },
  en: {
    kicker: "Service Notice",
    title: "Relay shutdown and next-stage transition",
    description: "This notice appears once after a successful login when you first enter the console.",
    close: "Understood",
    greeting: "To everyone connected to this site:",
    phase: "The core system is entering its final stage. This relay service will stop operating on June 8, 2026.",
    unlockLead: "During this final open window, we are unlocking the following model access:",
    window: "Availability: starting now and remaining open until shutdown. Please use it thoughtfully during the final countdown.",
    comfort: "But please do not be discouraged. This is not a disappearance. It is a restart.",
    future:
      "This domain will evolve into a brand-new forum community. New pages, new functions, and a new space for discussion will roll out in the next stage.",
    closing: "The relay chapter is nearing its end. The forum chapter is beginning.",
    thanks: "Thank you for being with us on the way here. See you on the new site.",
    signature: "— Administration",
  },
} as const;

export function ShutdownAnnouncementDialog({ enabled }: { enabled: boolean }) {
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const t = copy[language];

  useEffect(() => {
    if (!enabled) return;

    try {
      if (window.sessionStorage.getItem(shutdownNoticeAfterLoginStorageKey) !== "1") {
        return;
      }

      window.sessionStorage.removeItem(shutdownNoticeAfterLoginStorageKey);
      setOpen(true);
    } catch {
      // Ignore storage failures and skip the one-time notice.
    }
  }, [enabled]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[min(calc(100vw-2rem),42rem)] border-[#e6ddcf] bg-[#fbf7f0] p-0">
        <div className="relative overflow-hidden rounded-xl">
          <div className="bg-[linear-gradient(135deg,#171412_0%,#7a3b2b_48%,#d38758_100%)] px-6 py-6 text-[#fff8ef] sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="gap-2">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-[#ffd5b8]">{t.kicker}</p>
                <DialogTitle className="text-[1.65rem] leading-[1.05] text-[#fffaf4]">
                  {t.title}
                </DialogTitle>
                <DialogDescription className="max-w-[36rem] text-sm leading-6 text-[#ffe7d4]">
                  {t.description}
                </DialogDescription>
              </DialogHeader>
              <DialogClose
                aria-label={t.close}
                className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10 text-[#fff8ef] hover:bg-white/20 hover:text-white"
                type="button"
              >
                <X className="size-4" />
              </DialogClose>
            </div>
          </div>

          <div className="grid gap-5 px-6 py-6 sm:px-7">
            <div className="rounded-2xl border border-[#eadfce] bg-white/80 p-4 text-[#231f1b] shadow-[0_18px_50px_rgba(61,37,18,0.08)]">
              <p className="m-0 text-sm font-extrabold tracking-[0.04em] text-[#b55533]">{t.greeting}</p>
              <p className="mt-3 mb-0 text-sm leading-7 text-[#52493f]">{t.phase}</p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-[#e5d9c7] bg-[#fffdf9] p-4">
              <p className="m-0 text-sm font-extrabold text-[#201c18]">{t.unlockLead}</p>
              <div className="inline-flex w-fit items-center rounded-full border border-[#d9704a] bg-[#fff1e7] px-4 py-2 text-sm font-black text-[#9f492d]">
                DeepSeek V4 Pro
              </div>
              <p className="m-0 text-sm leading-7 text-[#5b5145]">{t.window}</p>
            </div>

            <div className="grid gap-3 text-sm leading-7 text-[#4f473d]">
              <p className="m-0">{t.comfort}</p>
              <p className="m-0">{t.future}</p>
              <p className="m-0 font-extrabold text-[#1d1916]">{t.closing}</p>
              <p className="m-0">{t.thanks}</p>
              <p className="m-0 font-extrabold text-[#7a3b2b]">{t.signature}</p>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setOpen(false)}>
                {t.close}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
