import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import './UserMenu.css';

interface UserMenuProps {
  name: string;
  onNameChange: (name: string) => void;
}

export function UserMenu({ name, onNameChange }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const firstLetter = name.charAt(0).toUpperCase();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (containerRef.current.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
      setIsEditingName(false);
      setDraftName(name);
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [name]);

  useEffect(() => {
    if (!open || !isEditingName || !inputRef.current) {
      return;
    }

    inputRef.current.focus();
    inputRef.current.select();
  }, [open, isEditingName]);

  useEffect(() => {
    if (open) {
      return;
    }

    setIsEditingName(false);
    setDraftName(name);
  }, [name, open]);

  const handleOpenNameEditor = () => {
    setDraftName(name);
    setIsEditingName(true);
  };

  const handleCancelNameEdit = () => {
    setDraftName(name);
    setIsEditingName(false);
  };

  const handleSaveName = (event: FormEvent) => {
    event.preventDefault();

    const cleanedName = draftName.trim();

    if (!cleanedName) {
      return;
    }

    onNameChange(cleanedName);
    setOpen(false);
    setIsEditingName(false);
  };

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="user-menu__button"
        onClick={() => setOpen((previous) => !previous)}
        type="button"
      >
        <span className="user-menu__avatar">{firstLetter}</span>
        <span className="user-menu__name">{name}</span>
        <span className="user-menu__caret">
          <ChevronDown size={16} />
        </span>
      </button>

      {open ? (
        <div className="user-menu__dropdown" role="menu">
          {!isEditingName ? (
            <button className="user-menu__option" onClick={handleOpenNameEditor} type="button">
              Change name
            </button>
          ) : (
            <form className="user-menu__form" onSubmit={handleSaveName}>
              <label className="user-menu__label" htmlFor="user-menu-name-input">
                Name
              </label>

              <input
                className="user-menu__input"
                id="user-menu-name-input"
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    handleCancelNameEdit();
                  }
                }}
                ref={inputRef}
                type="text"
                value={draftName}
              />

              <div className="user-menu__actions">
                <button className="user-menu__save" disabled={!draftName.trim()} type="submit">
                  Save
                </button>
                <button className="user-menu__cancel" onClick={handleCancelNameEdit} type="button">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
