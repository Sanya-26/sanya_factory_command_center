import type { ReactNode } from "react";

export interface TeamMember {
  id: string;
  name: string;
  title?: string;
  avatar?: string;
}

export function TeamMemberHeader({
  member,
  brandName,
  actions,
}: {
  member: TeamMember;
  brandName: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative z-10 flex items-center justify-between border-b border-black/10 bg-white/80 px-4 py-3">
      <div className="flex items-center gap-3">
        {member.avatar ? (
          <img src={member.avatar} alt={member.name} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-black text-xs text-white">
            {member.name.slice(0, 1)}
          </div>
        )}
        <div>
          <div className="text-sm font-semibold text-gray-950">{member.name}</div>
          <div className="text-xs text-gray-500">{member.title ?? brandName}</div>
        </div>
      </div>
      {actions}
    </header>
  );
}
