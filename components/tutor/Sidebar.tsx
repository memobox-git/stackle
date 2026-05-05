import Link from "next/link";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Calendar,
} from "lucide-react";

type NavId = "dashboard" | "courses" | "students" | "sessions";

type RecentChat = { id: string; title: string };

type Props = {
  active: NavId;
  recentChats: RecentChat[];
};

const navItems: { id: NavId; label: string; href: string; Icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", href: "/dashboard", Icon: LayoutDashboard },
  { id: "courses",   label: "Courses",   href: "/courses",   Icon: BookOpen },
  { id: "students",  label: "Students",  href: "/students",  Icon: Users },
  { id: "sessions",  label: "Sessions",  href: "/sessions",  Icon: Calendar },
];

export default function Sidebar({ active, recentChats }: Props) {
  return (
    <aside className="w-[180px] shrink-0 border-r border-gray-200 bg-white flex flex-col">
      <div className="px-5 py-5">
        <div className="font-semibold text-gray-900 text-[15px]">Tutor AI</div>
      </div>

      <nav className="px-3 flex flex-col gap-0.5">
        {navItems.map(({ id, label, href, Icon }) => {
          const isActive = active === id;
          return (
            <Link
              key={id}
              href={href}
              className={
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors " +
                (isActive
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:bg-gray-50")
              }
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex-1 flex flex-col min-h-0">
        <div className="px-6 mb-2 text-[11px] font-medium tracking-wider text-gray-500 uppercase">
          Recent chats
        </div>
        <ul className="px-3 flex-1 overflow-y-auto flex flex-col gap-0.5 pb-4">
          {recentChats.slice(0, 5).map((c) => (
            <li key={c.id}>
              <Link
                href={`/chat/${c.id}`}
                className="block px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-50 truncate"
                title={c.title}
              >
                {c.title}
              </Link>
            </li>
          ))}
          {recentChats.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-gray-500">No chats yet</li>
          )}
        </ul>
      </div>
    </aside>
  );
}
