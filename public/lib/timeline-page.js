(function exposeTimelinePage(root, factory) {
  const timelinePage = factory();
  if (typeof module === 'object' && module.exports) module.exports = timelinePage;
  else root.MasterListTimelinePage = timelinePage;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createTimelinePageModule() {
  const yearFor = (gig) => String(gig.date || '').match(/^(\d{4})/)?.[1] || '';
  function buildTimelineModel(shows = []) {
    const datedShows = shows.filter((gig) => yearFor(gig));
    const counts = datedShows.reduce((result, gig) => { const year = yearFor(gig); result[year] = (result[year] || 0) + 1; return result; }, {});
    const activeYears = Object.keys(counts).map(Number).sort((a, b) => a - b);
    const years = activeYears.length ? Array.from({ length: activeYears.at(-1) - activeYears[0] + 1 }, (_, index) => activeYears[0] + index) : [];
    const busiestYear = activeYears.length ? activeYears.reduce((best, year) => counts[year] >= counts[best] ? year : best, activeYears[0]) : null;
    return { shows, datedShows, undatedCount: shows.length - datedShows.length, counts, activeYears, years, busiestYear };
  }
  function yearDetail(model, selectedYear) {
    const shows = model.datedShows.filter((gig) => Number(yearFor(gig)) === Number(selectedYear)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const months = Array(12).fill(0);
    shows.forEach((gig) => { const month = Number(String(gig.date).slice(5, 7)); if (month >= 1 && month <= 12) months[month - 1] += 1; });
    return { shows, months, previousCount: model.counts[Number(selectedYear) - 1] || 0, difference: shows.length - (model.counts[Number(selectedYear) - 1] || 0) };
  }
  function createController({ page, window, document, getGigs, getRemoteShows, formatGigDate, escapeHtml, elements }) {
    const { summary: timelineSummary, chart: timelineChart, detail: timelineYearDetail, selectedYear: timelineSelectedYear, yearChange: timelineYearChange, months: timelineMonths, yearShows: timelineYearShows } = elements;
    const location = window.location; const history = window.history; const matchMedia = window.matchMedia.bind(window);
    function render() {
      const gigs = getGigs();
      const remoteSharedArchiveShows = getRemoteShows;
      if (page !== 'timeline' || !timelineChart) return;
      const allShows = [...gigs, ...remoteSharedArchiveShows()];
      const yearFor = (gig) => String(gig.date || '').match(/^(\d{4})/)?.[1] || '';
      const datedShows = allShows.filter((gig) => yearFor(gig));
      const undatedCount = allShows.length - datedShows.length;
      const counts = datedShows.reduce((result, gig) => {
        const year = yearFor(gig);
        result[year] = (result[year] || 0) + 1;
        return result;
      }, {});
      const availableYears = Object.keys(counts).map(Number).sort((a, b) => a - b);

      if (!availableYears.length) {
        timelineSummary.innerHTML = `<span><strong>0</strong>Dated shows</span><span><strong>${undatedCount}</strong>Undated</span><span><strong>—</strong>Busiest year</span>`;
        timelineChart.replaceChildren();
        const message = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        message.setAttribute('x', '480'); message.setAttribute('y', '190'); message.setAttribute('text-anchor', 'middle'); message.setAttribute('class', 'timeline-empty-label');
        message.textContent = 'ADD DATES TO REVEAL YOUR TIMELINE';
        timelineChart.append(message);
        timelineYearDetail.hidden = true;
        return;
      }

      timelineYearDetail.hidden = false;
      const firstYear = availableYears[0];
      const lastYear = availableYears.at(-1);
      const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
      const busiestYear = availableYears.reduce((best, year) => counts[year] >= counts[best] ? year : best, availableYears[0]);
      const requestedYear = Number(new URLSearchParams(location.search).get('year'));
      let selectedYear = years.includes(requestedYear) ? requestedYear : busiestYear;
      timelineSummary.innerHTML = `<span><strong>${datedShows.length}</strong>Dated shows</span><span><strong>${availableYears.length}</strong>Active years</span><span><strong>${busiestYear}</strong>Busiest · ${counts[busiestYear]} shows</span><span><strong>${undatedCount}</strong>Undated</span>`;

      const drawChart = () => {
        const width = 960; const height = 380;
        const margin = { top: 34, right: 48, bottom: 62, left: 48 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const maxCount = Math.max(...years.map((year) => counts[year] || 0), 1);
        const cumulative = [];
        years.reduce((total, year) => { const next = total + (counts[year] || 0); cumulative.push(next); return next; }, 0);
        const cumulativeMax = cumulative.at(-1) || 1;
        const slot = plotWidth / years.length;
        const barWidth = Math.max(5, Math.min(42, slot * .58));
        const x = (index) => margin.left + slot * index + slot / 2;
        const barY = (value) => margin.top + plotHeight - (value / maxCount) * plotHeight;
        const totalY = (value) => margin.top + plotHeight - (value / cumulativeMax) * plotHeight;
        const labelEvery = Math.max(1, Math.ceil(years.length / 12));
        const svg = [];
        svg.push(`<title id="timeline-chart-title">Shows attended from ${firstYear} to ${lastYear}</title><desc id="timeline-chart-description">${datedShows.length} dated shows. ${busiestYear} was busiest with ${counts[busiestYear]} shows. Select a year for details.</desc>`);
        for (let tick = 0; tick <= 4; tick += 1) {
          const value = Math.round((maxCount * tick) / 4);
          const y = barY(value);
          svg.push(`<line class="timeline-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="timeline-axis-label" x="${margin.left - 11}" y="${y + 4}" text-anchor="end">${value}</text>`);
        }
        years.forEach((year, index) => {
          const value = counts[year] || 0;
          const y = barY(value);
          const heightValue = Math.max(value ? 3 : 1, margin.top + plotHeight - y);
          const selected = year === selectedYear ? ' is-selected' : '';
          svg.push(`<a class="timeline-year-link${selected}" href="/timeline?year=${year}" data-timeline-year="${year}" aria-label="${year}: ${value} show${value === 1 ? '' : 's'}"><rect class="timeline-bar-hit" x="${x(index) - slot / 2}" y="${margin.top}" width="${slot}" height="${plotHeight}"></rect><rect class="timeline-bar" x="${x(index) - barWidth / 2}" y="${margin.top + plotHeight - heightValue}" width="${barWidth}" height="${heightValue}"></rect>${value ? `<text class="timeline-value-label" x="${x(index)}" y="${Math.max(margin.top + 12, y - 8)}" text-anchor="middle">${value}</text>` : ''}</a>`);
          if (index % labelEvery === 0 || index === years.length - 1 || year === selectedYear) svg.push(`<text class="timeline-year-label${selected}" x="${x(index)}" y="${height - 28}" text-anchor="middle">${year}</text>`);
        });
        const points = cumulative.map((value, index) => `${x(index)},${totalY(value)}`).join(' ');
        svg.push(`<polyline class="timeline-cumulative-line" points="${points}"></polyline>`);
        cumulative.forEach((value, index) => svg.push(`<circle class="timeline-cumulative-point" cx="${x(index)}" cy="${totalY(value)}" r="${years[index] === selectedYear ? 5 : 3}"><title>${value} total shows by ${years[index]}</title></circle>`));
        svg.push(`<text class="timeline-axis-title" x="${margin.left}" y="17">SHOWS</text><text class="timeline-axis-title timeline-axis-title-right" x="${width - margin.right}" y="17" text-anchor="end">${cumulativeMax} TOTAL</text>`);
        timelineChart.innerHTML = svg.join('');
        timelineChart.querySelectorAll('[data-timeline-year]').forEach((link) => link.addEventListener('click', (event) => {
          event.preventDefault();
          selectedYear = Number(link.dataset.timelineYear);
          const url = new URL(location.href); url.searchParams.set('year', selectedYear); history.replaceState({}, '', url);
          drawChart();
          drawYearDetail();
          if (matchMedia('(max-width: 640px)').matches) timelineYearDetail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
      };

      const drawYearDetail = () => {
        const selectedShows = datedShows.filter((gig) => Number(yearFor(gig)) === selectedYear).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const previousCount = counts[selectedYear - 1] || 0;
        const difference = selectedShows.length - previousCount;
        timelineSelectedYear.textContent = selectedYear;
        timelineYearChange.className = difference > 0 ? 'is-up' : difference < 0 ? 'is-down' : 'is-even';
        timelineYearChange.textContent = previousCount ? `${difference > 0 ? '▲' : difference < 0 ? '▼' : '◆'} ${Math.abs(difference)} ${difference === 0 ? 'change' : difference > 0 ? 'more' : 'fewer'} than ${selectedYear - 1}` : `${selectedShows.length} show${selectedShows.length === 1 ? '' : 's'} logged`;
        const monthCounts = Array(12).fill(0);
        selectedShows.forEach((gig) => { const month = Number(String(gig.date).slice(5, 7)); if (month >= 1 && month <= 12) monthCounts[month - 1] += 1; });
        const maxMonth = Math.max(...monthCounts, 1);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        timelineMonths.innerHTML = monthCounts.map((value, index) => `<div class="timeline-month" title="${monthNames[index]} ${selectedYear}: ${value} show${value === 1 ? '' : 's'}"><span class="timeline-month-count">${value || ''}</span><div><i style="height:${Math.max(value ? 8 : 2, (value / maxMonth) * 100)}%"></i></div><b>${monthNames[index]}</b></div>`).join('');
        const localIds = new Set(gigs.map((gig) => gig.id));
        timelineYearShows.innerHTML = selectedShows.length ? `<p class="eyebrow">${selectedShows.length} show${selectedShows.length === 1 ? '' : 's'} in ${selectedYear}</p><div>${selectedShows.map((gig) => `<a class="timeline-show-link" href="${localIds.has(gig.id) ? `/show?id=${encodeURIComponent(gig.id)}` : `/shows#shared-${encodeURIComponent(gig.id)}`}"><time>${escapeHtml(formatGigDate(gig.date, { month: 'short', day: 'numeric' }))}</time><span><strong>${escapeHtml(gig.artist)}</strong><small>${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)}</small></span><b aria-hidden="true">→</b></a>`).join('')}</div>` : `<p class="empty-state">No shows logged in ${selectedYear}. The quiet years count too.</p>`;
      };

      drawChart();
      drawYearDetail();
    }
    return { render };
  }
  return { yearFor, buildTimelineModel, yearDetail, createController };
}));
