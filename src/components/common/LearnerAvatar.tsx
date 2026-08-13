import React from 'react';
import { Learner } from '../../types/common';
import { User } from 'lucide-react';

interface LearnerAvatarProps {
  learner?: Learner | null;
  size?: 'sm' | 'md' | 'lg';
}

export const LearnerAvatar: React.FC<LearnerAvatarProps> = ({ learner, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
  };

  if (!learner) {
    return (
      <div className={`${sizeClasses[size]} rounded-full bg-slate-800 text-slate-400 flex items-center justify-center font-medium`}>
        <User className="w-1/2 h-1/2" />
      </div>
    );
  }

  if (learner.avatarUrl) {
    return (
      <img
        src={learner.avatarUrl}
        alt={learner.name}
        referrerPolicy="no-referrer"
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-blue-500/30`}
      />
    );
  }

  const initials = learner.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`${sizeClasses[size]} rounded-full bg-blue-600 text-white font-bold flex items-center justify-center ring-2 ring-blue-400/30 shadow-sm`}>
      {initials}
    </div>
  );
};
