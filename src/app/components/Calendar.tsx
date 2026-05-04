import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Package, Truck, RefreshCw, Calendar as CalendarIcon } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string
  type: 'pickup' | 'delivery' | 'turnover' | 'order' | 'production';
  status?: string;
  orderId?: string;
  customer?: string;
}

interface CalendarProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  className?: string;
}

const eventTypeConfig = {
  pickup: { label: 'Pick-up', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: Package },
  delivery: { label: 'Delivery', color: 'bg-green-100 text-green-700 border-green-200', icon: Truck },
  turnover: { label: 'Turnover', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: RefreshCw },
  order: { label: 'Order', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CalendarIcon },
  production: { label: 'Production', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Package },
};

export function Calendar({ events, onEventClick, className = '' }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(event => {
      const dateKey = event.date.split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(event);
    });
    return map;
  }, [events]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const renderCalendarDays = () => {
    const days = [];
    
    // Empty cells for days before the first day of month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-24 bg-gray-50/50" />);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = eventsByDate[dateKey] || [];
      const isToday = new Date().toISOString().split('T')[0] === dateKey;
      const isSelected = selectedDate === dateKey;

      days.push(
        <div
          key={day}
          onClick={() => setSelectedDate(isSelected ? null : dateKey)}
          className={`h-24 border border-gray-100 p-2 cursor-pointer transition-all hover:bg-gray-50 ${
            isToday ? 'bg-blue-50/50' : ''
          } ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
              {day}
            </span>
            {isToday && (
              <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full">Today</span>
            )}
          </div>
          <div className="space-y-1 overflow-y-auto max-h-16">
            {dayEvents.slice(0, 3).map((event, idx) => {
              const config = eventTypeConfig[event.type];
              const Icon = config.icon;
              return (
                <div
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(event);
                  }}
                  className={`text-[10px] px-1.5 py-0.5 rounded border truncate flex items-center gap-1 cursor-pointer hover:opacity-80 ${config.color}`}
                  title={`${config.label}: ${event.title}`}
                >
                  <Icon className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{event.title}</span>
                </div>
              );
            })}
            {dayEvents.length > 3 && (
              <div className="text-[10px] text-gray-500 pl-1">+{dayEvents.length - 3} more</div>
            )}
          </div>
        </div>
      );
    }

    return days;
  };

  const selectedDateEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-gray-900">
            {monthNames[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => navigateMonth('next')}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          Today
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        {Object.entries(eventTypeConfig).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-full ${config.color.split(' ')[0]}`} />
            <span className="text-xs text-gray-600">{config.label}</span>
          </div>
        ))}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {weekDays.map(day => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {renderCalendarDays()}
      </div>

      {/* Selected date events panel */}
      {selectedDate && selectedDateEvents.length > 0 && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">
              Events for {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {selectedDateEvents.map((event, idx) => {
              const config = eventTypeConfig[event.type];
              const Icon = config.icon;
              return (
                <div
                  key={idx}
                  onClick={() => onEventClick?.(event)}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{event.title}</p>
                    {event.customer && (
                      <p className="text-xs text-gray-500">Customer: {event.customer}</p>
                    )}
                    {event.status && (
                      <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {event.status}
                      </span>
                    )}
                  </div>
                  {event.orderId && (
                    <span className="text-xs text-gray-400">#{event.orderId.slice(-6)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default Calendar;
