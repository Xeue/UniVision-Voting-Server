/*jshint esversion: 6 */
let autoScroll = 1;

function createRows(votesObj) {
	for (var i = 0; i < votesObj.length; i++) {
		let vote = votesObj[i];

		$old = $('#voteMeta_' + vote.PK);
		if ($old.length == 0) {
			$tr = $('<tr></tr>');
			$tr.prop('id', 'voteMeta_' + vote.PK);
			$('#vAdmin_feed_table').append($tr);
		} else {
			$old.html("");
			$tr = $old;
			$old.removeClass("vAdmin_enabled_no_tr");
		}

		$tr.data('email', vote.email);
		$tr.data('fromUni', vote.fromUni);
		$tr.data('act', vote.act);
		$tr.data('IP', vote.IP);
		$tr.data('dateVote', vote.dateVote);

		$email = $('<td>' + vote.email + '</td>');
		$uni = $('<td>' + getUni(vote.fromUni).name + '</td>');
		$act = $('<td>' + getUni(vote.act).act + '</td>');
		$verify = $('<td></td>');
		if (vote.verified == "1") {
			$verify.html("Yes");
			$verify.addClass("vAdmin_verify_yes");
		} else {
			$verify.html("No");
			$verify.addClass("vAdmin_verify_no");
		}
		$enabled = $('<td>' + vote.enabled + '</td>');
		if (vote.enabled == "1") {
			$enabled.html("Yes");
			$enabled.addClass("vAdmin_enabled_yes");
		} else {
			$enabled.html("No");
			$enabled.addClass("vAdmin_enabled_no");
			$tr.addClass("vAdmin_enabled_no_tr");
		}
		$ip = $('<td>' + vote.IP + '</td>');
		$ban = $('<td></td>');
		if (bans.includes(vote.IP)) {
			$ban.addClass("vAdmin_ban_yes");
			$ban.html("Banned");
		} else {
			$ban.addClass("vAdmin_ban_no");
		}
		$time = $('<td>' + vote.dateVote + '</td>');

		$tr.append($email);
		$tr.append($uni);
		$tr.append($act);
		$tr.append($verify);
		$tr.append($enabled);
		$tr.append($ip);
		$tr.append($ban);
		$tr.append($time);
	}
	if (autoScroll) {
		$('#vAdmin_feed_cont').animate({ scrollTop: $('#vAdmin_feed_tbody > tr:last-child').offset().top }, 600);
	}
}

let pubVotes = {};
let pubVote = {};
let runningTotal = {};
let allTots = {};
let judgeTots = {};
let webConnection;

function getUni(PK) {
	for (let index = 0; index < uni.length; index++) {
		if (uni[index].PK == PK) return uni[index]
	}
	return {
		"name": "undefined",
		"short": "undefined",
		"act": "undefined",
		"email": "undefined",
		"order": "undefined"
	}
}

function renderTotal(totals) {
	uni.forEach(act => {
		pubVotes[act.PK] = 0;
	})
	$cont = $("#vAdmin_totals");
	$cont.html("");
	for (var variable in totals) {
		if (totals.hasOwnProperty(variable)) {
			let $blockCont = $("<section id='pubTotal" + variable + "' class='pubTotals'></section>");
			let $title = $("<div class='pubTitle'>" + getUni(variable).name + "</div>");
			let $table = $("<table><thead><th>Act</th><th>Total</th><th>Points</th></thead></table>");
			let $tbody = $("<tbody></tbody>");
			let tots = totals[variable];
			let sorted = [];
			let tfootTotal = 0;
			for (var univer in tots) {
				if (tots.hasOwnProperty(univer)) {
					let score = tots[univer];
					tfootTotal += parseInt(score);
					if (sorted.hasOwnProperty(score)) {
						sorted[score].push(univer);
					} else {
						sorted[score] = [univer];
					}
				}
			}

			let numActs = Object.keys(uni).length;
			let points = numActs * 2 - 1;
			let unis = [];
			for (var i = sorted.length; i > 0; i--) {
				let rank = sorted[i - 1];
				if (typeof rank !== "undefined") {
					let tie = rank.length;
					points = points - tie;
					for (var j = 0; j < rank.length; j++) {
						pubVotes[rank[j]] += points;
						unis.push(rank[j]);
						let $tr = $("<tr data-points='" + points + "'><td>" + getUni(rank[j]).short + "</td><td>" + (i - 1) + "</td><td>" + points + "</td></tr>");
						$tbody.append($tr);
					}
					points = points - tie;
				}
			}
			uni.forEach(act => {
				const $etr = $(`<tr data-points='0'><td>${act.short}</td><td>0</td><td>0</td></tr>`);
				$tbody.append($etr);
			})
			let $trr = $("<tr></tr>");
			let $tfh = $("<td>Total Votes</td>");
			let $tfr = $("<td colspan='2'></td>");
			$tfr.html(tfootTotal);
			let $tfoot = $("<tfoot></tfoot>");
			$trr.append($tfh);
			$trr.append($tfr);
			$tfoot.append($trr);
			$table.append($tbody);
			$table.append($tfoot);
			$blockCont.append($title);
			$blockCont.append($table);
			$cont.append($blockCont);
		}
	}
	//sortTables();
}

function renderTotals(totals) {
	uni.forEach(act => {
		$("#pubTot" + act.PK).html(pubVotes[act.PK]);
		if (judgeTots[act.PK] == undefined) {
			judgeTots[act.PK] = 0;
		}
		$("#allTot" + act.PK).html(pubVotes[act.PK] + judgeTots[act.PK]);
		$("#pubVot" + act.PK).html(parseInt(totals[act.PK]));
		$("#pubTot" + act.PK).parent().data("points", pubVotes[act.PK]);
	})
	sortTables();
}

function sortTables() {
	console.log("Sorting");
	$collection = $("#totalsCont").children();
	for (var i = 0; i < $collection.length; i++) {
		$collection.each(function () {
			while ($(this).data("points") < $(this).next().data("points")) {
				console.log($(this));
				console.log($(this).next());
				$(this).next().after($(this));
			}
		});
	}
}

$(document).ready(function () {
	$(document).click(function (e) {
		$target = $(e.target);

		if ($target.is("#voteAdmin_open")) {
			let wsMsg = {};
			wsMsg.type = "voteAdmin";
			wsMsg.command = "status";
			wsMsg.status = "OPEN";
			webConnection.send(wsMsg);
			$target.blur();
		} else if ($target.is("#voteAdmin_close")) {
			let wsMsg = {};
			wsMsg.type = "voteAdmin";
			wsMsg.command = "status";
			wsMsg.status = "CLOSED";
			webConnection.send(wsMsg);
			$target.blur();
		} else if ($target.is("#voteAdmin_early")) {
			let wsMsg = {};
			wsMsg.type = "voteAdmin";
			wsMsg.command = "status";
			wsMsg.status = "EARLY";
			webConnection.send(wsMsg);
			$target.blur();
		} else if ($target.is("#voteAdmin_editActs") || $target.is("#voteActs_close")) {
			$("#voteActs_cont").toggleClass("hidden");
		} else if ($target.is("#voteActs_save")) {
			doActsSave();
		} else if ($target.is("#voteActs_new")) {
			webConnection.send({
				type: "voteEdit",
				command: "new"
			});
		} else if ($target.is("#voteAdmin_reset")) {
			if (confirm('This will delete ALL votes, this cannot be undone...')) {
				webConnection.send({
					type: "voteAdmin",
					command: "reset"
				});
			}
		} else if ($target.hasClass("voteActs_delete")) {
			if (confirm('Deleting a University cannot be undone and will remove ALL votes that come from this uni or are for this uni')) {
				const $row = $target.closest('tr');
				const $afters = $row.nextAll();
				$afters.each(function() {
					$(this).addClass('voteActs_changed_row');
					const $place = $(this).find('.voteActs_place');
					$place.val(Number($place.val()) - 1);
					$place.closest('td').addClass('voteActs_changed');
				});
				doActsSave();
				webConnection.send({
					type: "voteEdit",
					command: "delete",
					PK: $target.data("pk")
				});
			}
		} else if ($target.hasClass('vAdmin_ban_no')) {
			webConnection.send({
				"type": "voteAdmin",
				"command": "banIP",
				"IP": $target.parent().data('IP')
			});
		} else if ($target.hasClass('vAdmin_ban_yes')) {
			webConnection.send({
				"type": "voteAdmin",
				"command": "unBanIP",
				"IP": $target.parent().data('IP')
			});
		} else if ($target.hasClass('vAdmin_enabled_no')) {
			webConnection.send({
				"type": "voteAdmin",
				"command": "include",
				"PK": $target.parent().attr('id').replace("voteMeta_", "")
			});
		} else if ($target.hasClass('vAdmin_enabled_yes')) {
			webConnection.send({
				"type": "voteAdmin",
				"command": "exclude",
				"PK": $target.parent().attr('id').replace("voteMeta_", "")
			});
		} else if ($target.hasClass('vAdmin_verify_yes')) {
			const $parent = $target.parent();
			webConnection.send({
				"type":"voteAdmin",
				"command":"unVerify",
				"PK": $parent.attr('id').replace("voteMeta_", ""),
				"email": $parent.data('email'),
				"act": $parent.data('act'),
				"IP": $parent.data('IP'),
				"dateVote": $parent.data('dateVote')
			});
		} else if ($target.hasClass('vAdmin_verify_no')) {
			const $parent = $target.parent();
			webConnection.send({
				"type": "voteAdmin",
				"command": "verify",
				"PK": $parent.attr('id').replace("voteMeta_", ""),
				"email": $parent.data('email'),
				"act": $parent.data('act'),
				"IP": $parent.data('IP'),
				"dateVote": $parent.data('dateVote')
			});
		} else if ($target.is('#vAdmin_autoScroll')) {
			$target.toggleClass("vote_bttn_active");
			autoScroll = $target.hasClass("vote_bttn_active");
			$target.blur();
		} else if ($target.hasClass("voteActs_move")) {
			const $place = $($target.siblings('.voteActs_place')[0]);
			const $row = $target.closest('tr');
			$place.parent().addClass('voteActs_changed');
			$row.addClass('voteActs_changed_row');
			const count = $('#voteActs_table').children().length;
			const place = Number($place.val());
			if ($target.data('direction') == 'up') {
				if (place > 1) {
					$place.val(place-1);
					$row.prev().addClass('voteActs_changed_row');
					const $prevPlace = $row.prev().find('.voteActs_place');
					$prevPlace.parent().addClass('voteActs_changed');
					const prevVal = Number($prevPlace.val());
					$prevPlace.val(prevVal+1)
					$row.prev().before($row);
				}
			} else {
				if (place < count) {
					$place.val(place+1);
					$row.next().addClass('voteActs_changed_row');
					const $nextPlace = $row.next().find('.voteActs_place');
					$nextPlace.parent().addClass('voteActs_changed');
					const nextVal = Number($nextPlace.val());
					$nextPlace.val(nextVal-1)
					$row.next().after($row);
				}
			}
		}
	});

	$(document).change(function (e) {
		$target = $(e.target);
		if ($target.hasClass("voteActs_input")) {
			$target.parent().addClass("voteActs_changed");
			$target.parent().parent().addClass("voteActs_changed_row");
		}
	});

	$("main").addClass("disconnected");

	webConnection = new webSocket(host, 'Browser', version, ssl);
	webConnection.addEventListener('message', event => {
		const [header, payload] = event.detail;
		socketDoMessage(header, payload);
	});
	webConnection.addEventListener('open', () => {
		socketDoOpen(webConnection);
		$('main').removeClass('disconnected');
	});
	webConnection.addEventListener('close', () => {
		$('main').addClass('disconnected');
	});

});

function doActsSave() {
	const $rows = $(".voteActs_changed_row");
	const data = {};
	for (let i = 0; i < $rows.length; i++) {
		const $row = $($rows[i]);
		const PK = $row.data("pk");
		data[PK] = {};
		$row.children(".voteActs_changed").each(function () {
			let $input = $(this).find("input");
			data[PK][$input.data("prop")] = $input.val();
		});
	}
	$(".voteActs_changed").removeClass("voteActs_changed");
	$rows.removeClass("voteActs_changed_row");
	const wsMsg = {};
	wsMsg.type = "voteEdit";
	wsMsg.command = "save";
	wsMsg.data = data;
	webConnection.send(wsMsg);
}

function socketDoOpen(socket) {
	socket.send({ "type": "voteAdmin", "command": "getMeta" });
}

function socketDoMessage(header, data) {
	if (data.type == "voteMeta") {
		createRows(data.votes);
	} else if (data.type == "voteBans") {
		bans = data.IPs;
	} else if (data.type == "voteStatus") {
		if (data.status == "OPEN") {
			$('#voteAdmin_open').addClass('vote_bttn_active');
			$('#voteAdmin_open').siblings().removeClass("vote_bttn_active");
		} else if (data.status == "CLOSED") {
			$('#voteAdmin_close').addClass('vote_bttn_active');
			$('#voteAdmin_close').siblings().removeClass("vote_bttn_active");
		} else {
			$('#voteAdmin_early').addClass('vote_bttn_active');
			$('#voteAdmin_early').siblings().removeClass("vote_bttn_active");
		}
	} else if (data.type == "voteActs") {
		uni = data.data;
		$("#totalsCont").html("");
		$("#judgeTotalsCont").html("");
		$("#allTotalsCont").html("");
		$("#voteActs_table").html("");
		uni.forEach(act => {
			let $tr = $("<tr></tr>");
			let $pubName = $(`<td>${act.short}  -  ${act.act}</td>`);
			let $pubVot = $(`<td id="pubVot${act.order}"></td>`);
			let $pubTot = $(`<td id="pubTot${act.order}"></td>`);
			$tr.append($pubName);
			$tr.append($pubTot);
			$tr.append($pubVot);
			$("#totalsCont").append($tr);

			let $jtr = $("<tr></tr>");
			let $jpubName = $(`<td>${act.short}  -  ${act.act}</td>`);
			let $jpubTot = $(`<td id="judgeTot${act.order}"></td>`);
			$jtr.append($jpubName);
			$jtr.append($jpubTot);
			$("#judgeTotalsCont").append($jtr);

			let $atr = $("<tr></tr>");
			let $apubName = $(`<td>${act.short}  -  ${act.act}</td>`);
			let $apubTot = $(`<td id="allTot${act.order}"></td>`);
			$atr.append($apubName);
			$atr.append($apubTot);
			$("#allTotalsCont").append($atr);

			let $row = $(`<tr data-pk="${act.PK}"></tr>`);
			for (var prop in act) {
				if (act.hasOwnProperty(prop)) {
					let $tr;
					if (prop == 'order') {
						$tr = $(`<td class="voteActs_cont">
							<button class="voteActs_move" data-direction="up" type="button">🡅</button>
							<input data-prop="${prop}" type="text" class="voteActs_place" readonly value="${act[prop]}">
							<button class="voteActs_move" data-direction="down" type="button">🡇</button>
						</td>`);
					} else if (prop != 'PK') {
						$tr = $(`<td><input class="voteActs_input" data-prop="${prop}" value="${act[prop]}"></td>`);
					}
					$row.append($tr);
				}
			}
			$row.append($(`<td><button type='button' class='voteActs_delete' data-pk='${act.PK}'>Delete</button></td>`));
			$("#voteActs_table").append($row);
		});
	} else if (data.type == "voteTotal") {
		runningTotal[data.PK] = data.total;
		renderTotal(runningTotal);
	} else if (data.type == "voteTotals") {
		renderTotals(data.totals);
	} else if (data.type == "voteJudge") {
		for (var act in data.points) {
			if (data.points.hasOwnProperty(act)) {
				judgeTots[act] = data.points[act];
				if (pubVotes[act] == undefined) {
					pubVotes[act] = 0;
				}
				$("#allTot" + act).html(pubVotes[act] + judgeTots[act]);
				$("#judgeTot" + act).html(judgeTots[act]);
			}
		}
	} else if (data.type == "adminReset") {
		$("#vAdmin_feed_tbody").html("");
	}
}
