"use client";



import { MoreHorizontal } from "lucide-react";



import { CHAT_CONTAINER_CLASS } from "@/lib/conversation-layout";

import { cn } from "@/lib/utils";



export function ConversationHome({

  children,

  quickActions,

}: {

  children: React.ReactNode;

  quickActions?: React.ReactNode;

}) {

  return (

    <div className="flex min-h-screen flex-col">

      <header className="flex shrink-0 items-center justify-between px-6 py-4 lg:px-8">

        <span className="text-[13px] font-semibold tracking-[0.12em] text-white/75">

          VAYNE

        </span>

        <button

          type="button"

          className="flex size-9 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"

          aria-label="Menu"

        >

          <MoreHorizontal className="size-5" strokeWidth={1.5} />

        </button>

      </header>



      <main className="flex min-h-0 flex-1 flex-col items-center justify-center pb-16">

        <div

          className={cn(

            "flex w-full flex-col items-center text-center",

            CHAT_CONTAINER_CLASS,

          )}

        >

          <h1 className="text-balance text-[clamp(1.625rem,3.5vw,2.125rem)] font-medium leading-tight tracking-[-0.025em] text-white">

            What should we investigate?

          </h1>



          <div className="mt-10 w-full">{children}</div>



          {quickActions ? <div className="mt-5 w-full">{quickActions}</div> : null}

        </div>

      </main>

    </div>

  );

}


