import { NavLink } from 'react-router-dom';

interface SubNavItem {
  label: string;
  path: string;
}

interface SubNavProps {
  items: SubNavItem[];
}

export function SubNav({ items }: SubNavProps) {
  if (items.length === 0) return null;

  return (
    <div className="subnav">
      {items.map((item) => (
        <NavLink key={item.path} to={item.path} className="subnav-link">
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
