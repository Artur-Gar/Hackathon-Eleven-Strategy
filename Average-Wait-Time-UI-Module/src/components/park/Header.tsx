import { AppConfig } from "@/config/AppConfig";
import { ArrowLeft, Waves } from "lucide-react";

interface HeaderProps {
  onAdminClick: () => void;
}

export function Header({ onAdminClick }: HeaderProps) {
  return (
    <header className="bg-primary text-primary-foreground py-5 px-4 shadow-lg">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Waves size={28} className="text-park-accent" />
          <div>
            <h1 className="text-xl font-extrabold leading-tight">
              {AppConfig.headerTitle}
            </h1>
            <p className="text-sm opacity-75 font-semibold">
              {AppConfig.headerSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAdminClick}
            className="p-2 rounded-lg opacity-80 hover:opacity-100 hover:bg-primary-foreground/10 transition-all"
            aria-label="Admin"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          {AppConfig.backButton.enabled && (
            <a
              href={AppConfig.backButton.targetUrl}
              target={AppConfig.backButton.openInNewTab ? "_blank" : "_self"}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold opacity-80 hover:opacity-100 transition-opacity px-3 py-1.5 rounded-lg hover:bg-primary-foreground/10"
            >
              {AppConfig.backButton.label}
              <ArrowLeft size={16} />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
