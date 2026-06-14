/* ============================================================
   BLOG ARTICLES — blog-data.js
   Pour publier un nouvel article : copier un objet, modifier
   les champs, incrémenter l'id. Aucune autre manipulation.
   ============================================================ */

var articles = [
  {
    id: 1,
    titre: "Cautionnement bancaire : dans quels cas peut-on contester son engagement ?",
    date: "12 juin 2025",
    categorie: "Droit bancaire",
    extrait: "Vous avez signé un cautionnement pour votre société et votre banque vous réclame aujourd'hui des sommes considérables à titre personnel ? Cet engagement n'est pas irréversible. Dans de nombreuses situations, il peut être contesté, réduit, voire annulé.",
    contenu: `
      <p>Vous avez signé un cautionnement pour votre société et votre banque vous réclame aujourd'hui des sommes considérables à titre personnel ? Cet engagement n'est pas irréversible. Dans de nombreuses situations, il peut être contesté, réduit, voire annulé. Encore faut-il identifier rapidement les failles juridiques exploitables.</p>

      <h2>Qu'est-ce que le cautionnement bancaire ?</h2>
      <p>Le cautionnement est un contrat par lequel une personne — la caution — s'engage à rembourser les dettes d'un débiteur principal (votre société, par exemple) si ce dernier n'y fait pas face. En pratique, les banques exigent systématiquement ce type de garantie des dirigeants lorsqu'elles accordent un crédit à une PME ou à une TPE.</p>
      <p>Ce mécanisme est légalement encadré, notamment par le code civil (articles 2288 et suivants) et les dispositions protectrices du code de la consommation lorsque la caution est une personne physique. Ces règles créent de nombreuses possibilités de contestation que les banques omettent souvent de mentionner à leurs clients.</p>

      <h2>Les conditions de validité du cautionnement</h2>

      <h3>L'exigence de la mention manuscrite</h3>
      <p>Pour qu'un cautionnement consenti par une personne physique envers un créancier professionnel soit valable, la loi impose une mention manuscrite précise, reproduisant mot pour mot la formule légale indiquant le montant et la durée de l'engagement. L'absence, l'incomplétude ou la modification de cette mention peut entraîner la nullité du cautionnement. De nombreux contentieux portent précisément sur ce point : une erreur de retranscription, une abréviation, une mention dactylographiée plutôt que manuscrite suffit à remettre en cause l'engagement.</p>

      <h3>La proportionnalité de l'engagement</h3>
      <p>Un cautionnement manifestement disproportionné aux revenus et au patrimoine de la caution au moment de sa signature ne peut pas être invoqué par le créancier professionnel. La jurisprudence de la Cour de cassation est constante sur ce point : la banque doit vérifier la solvabilité de la caution avant de recueillir son engagement. Si elle ne l'a pas fait, ou si l'engagement est objectivement excessif au regard de la situation financière de la caution, le cautionnement est inopposable.</p>

      <h2>Les manquements de la banque à ses obligations</h2>

      <h3>Le défaut d'information annuelle</h3>
      <p>La banque a l'obligation légale d'informer chaque caution personne physique, avant le 31 mars de chaque année, du montant du principal, des intérêts, commissions et frais restant dus. En cas de manquement à cette obligation, la banque perd le droit aux intérêts et pénalités échus depuis la dernière information jusqu'à la date à laquelle elle a régularisé. C'est une sanction significative que peu de cautions connaissent.</p>

      <h3>Le devoir de mise en garde de la caution</h3>
      <p>Lorsque la caution est non avertie — c'est-à-dire qu'elle ne dispose pas des compétences financières ou professionnelles lui permettant d'appréhender les risques de l'opération — la banque est tenue d'un devoir de mise en garde. Elle doit attirer l'attention de la caution sur les risques liés à son engagement et, notamment, sur le fait que la couverture du crédit pourrait lui être demandée en cas de défaillance du débiteur principal.</p>

      <h2>Les cas d'annulation ou de réduction de l'engagement</h2>
      <p>Au-delà des règles formelles, plusieurs situations permettent d'obtenir la nullité ou la réduction du cautionnement :</p>
      <ul>
        <li>Le soutien abusif : si la banque a maintenu un crédit en sachant que l'entreprise était condamnée, sa faute peut rejaillir sur la mise en œuvre du cautionnement.</li>
        <li>L'erreur ou le dol : si la caution a été induite en erreur sur la portée de son engagement ou la situation financière réelle de l'emprunteur.</li>
        <li>La caution multiple : si plusieurs cautions ont signé pour le même engagement, des recours entre cofidéjusseurs sont possibles.</li>
        <li>L'extinction de la dette principale : le cautionnement étant accessoire, si la dette principale est éteinte (prescription, paiement, remise de dette), le cautionnement l'est également.</li>
      </ul>

      <h2>Comment agir face à des poursuites ?</h2>
      <p>Si votre banque engage des poursuites à votre encontre en qualité de caution, le délai pour réagir est court. Il est essentiel d'analyser rapidement le contrat de cautionnement, les conditions dans lesquelles il a été souscrit, et les échanges avec la banque depuis la signature. Ces documents permettront d'identifier les arguments de défense disponibles.</p>
      <p>Le cabinet analyse votre dossier et détermine, dès la première consultation, quels moyens juridiques peuvent être soulevés pour contester ou limiter votre engagement de caution.</p>

      <div class="article-cta">
        <p>Vous faites l'objet de poursuites en tant que caution ? Votre situation mérite une analyse rapide et précise.</p>
        <a href="../pages/contact.html" class="btn btn--outline-white">Prendre rendez-vous</a>
      </div>
    `
  },
  {
    id: 2,
    titre: "Responsabilité de la banque : quand le devoir de mise en garde n'a pas été respecté",
    date: "28 mai 2025",
    categorie: "Responsabilité bancaire",
    extrait: "Votre banque vous a accordé un crédit que vous ne pouviez pas rembourser ? Elle ne vous a pas alerté des risques liés à votre emprunt ? Le devoir de mise en garde est une obligation légale dont le non-respect engage la responsabilité de l'établissement.",
    contenu: `
      <p>Votre banque vous a accordé un crédit que vous ne pouviez pas rembourser ? Elle ne vous a pas alerté des risques liés à votre emprunt ? Le devoir de mise en garde est une obligation légale dont le non-respect engage la responsabilité de l'établissement prêteur. C'est un levier souvent méconnu, mais redoutablement efficace.</p>

      <h2>Qu'est-ce que le devoir de mise en garde ?</h2>
      <p>Consacré par une jurisprudence constante de la Cour de cassation depuis 2005, le devoir de mise en garde impose au banquier dispensateur de crédit d'alerter son client non averti sur les risques d'endettement excessif liés à l'octroi d'un prêt, au regard de ses capacités financières et des charges du crédit.</p>
      <p>Il ne s'agit pas d'un simple conseil ou d'une recommandation : c'est une obligation contractuelle dont le manquement ouvre droit à réparation. La banque doit démontrer qu'elle a accompli cette démarche. En l'absence de preuve, sa responsabilité est engagée.</p>

      <h2>Qui peut invoquer ce devoir ?</h2>
      <p>Le devoir de mise en garde ne bénéficie qu'aux emprunteurs <em>non avertis</em>. La jurisprudence distingue :</p>
      <ul>
        <li><strong>L'emprunteur averti</strong> : celui qui dispose des compétences techniques, financières ou professionnelles lui permettant d'évaluer lui-même les risques du crédit (professionnel de la finance, dirigeant expérimenté dans la gestion de dettes professionnelles complexes).</li>
        <li><strong>L'emprunteur non averti</strong> : particulier, dirigeant sans expertise financière particulière, entrepreneur inexpérimenté. C'est à lui que le devoir de mise en garde s'applique pleinement.</li>
      </ul>
      <p>La qualification dépend des circonstances concrètes et fait souvent l'objet d'un débat devant le tribunal. Le cabinet analyse votre profil pour déterminer dans quelle catégorie vous vous situez.</p>

      <h2>Les conditions requises pour engager la responsabilité de la banque</h2>
      <p>Trois éléments doivent être réunis :</p>
      <ul>
        <li>Vous êtes un emprunteur non averti au sens de la jurisprudence.</li>
        <li>Le crédit accordé était inadapté à vos capacités financières ou présentait un risque d'endettement excessif objectivement identifiable.</li>
        <li>La banque a omis de vous alerter sur ces risques avant la conclusion du contrat de prêt.</li>
      </ul>
      <p>Le caractère inadapté du crédit s'apprécie au moment de l'octroi, en comparant le montant des échéances au revenu disponible de l'emprunteur. Un taux d'endettement excessif, des revenus insuffisants ou instables, ou une situation de surendettement préexistante sont autant d'indices que la banque aurait dû relever.</p>

      <h2>Quelles conséquences pour la banque fautive ?</h2>
      <p>Le manquement au devoir de mise en garde ouvre droit à des dommages et intérêts correspondant à la <em>perte de chance</em> de ne pas contracter le prêt. En pratique, selon les circonstances, cette réparation peut représenter une fraction significative — parfois la totalité — du capital restant dû.</p>
      <p>Ces dommages et intérêts peuvent être opposés à la banque par voie d'exception (en défense à ses propres poursuites) ou faire l'objet d'une action autonome si vous avez déjà remboursé le prêt en subissant un préjudice.</p>

      <h2>Cas particulier : la caution non avertie</h2>
      <p>Le devoir de mise en garde s'applique également aux cautions personnes physiques non averties. Si vous avez signé un cautionnement sans que la banque vous alerte sur les risques de cet engagement au regard de votre situation financière, vous disposez d'une action en responsabilité distincte de celle de l'emprunteur principal.</p>

      <h2>Comment agir concrètement ?</h2>
      <p>L'action en responsabilité pour manquement au devoir de mise en garde se prescrit par cinq ans à compter du jour où le préjudice s'est manifesté. Il est donc essentiel de ne pas attendre. Le cabinet analyse les conditions dans lesquelles votre crédit a été accordé, réunit les preuves pertinentes et construit une stratégie adaptée à votre situation.</p>

      <div class="article-cta">
        <p>Votre banque a accordé un crédit sans vous alerter des risques ? Le cabinet évalue votre dossier dès la première consultation.</p>
        <a href="../pages/contact.html" class="btn btn--outline-white">Prendre rendez-vous</a>
      </div>
    `
  },
  {
    id: 3,
    titre: "Fraude au virement bancaire : qui est responsable, la banque ou vous ?",
    date: "14 mai 2025",
    categorie: "Fraude bancaire",
    extrait: "Un virement a été exécuté depuis votre compte sans votre autorisation. La banque affirme que vous êtes responsable. Est-ce vraiment le cas ? En matière de fraude bancaire, le principe est la responsabilité de l'établissement — sauf faute grave du client.",
    contenu: `
      <p>Un virement a été exécuté depuis votre compte sans votre autorisation. La banque affirme que vous êtes responsable. Est-ce vraiment le cas ? En matière de fraude bancaire, le principe légal est clair : la banque est responsable des opérations de paiement non autorisées — sauf à démontrer la faute grave du client. Ce renversement de la charge de la preuve est méconnu mais fondamental.</p>

      <h2>Le principe : la responsabilité de la banque</h2>
      <p>L'article L.133-18 du code monétaire et financier pose un principe simple : lorsqu'une opération de paiement non autorisée par le payeur est constatée, la banque doit rembourser immédiatement le montant frauduleux et rétablir le compte dans l'état où il se serait trouvé sans cette opération.</p>
      <p>Ce principe s'applique que la fraude ait été commise par un tiers, par un employé, ou à la suite d'une défaillance des systèmes de sécurité de la banque. L'établissement est garant de la sécurité des opérations de paiement qu'il traite.</p>

      <h2>L'exception : la faute grave du client</h2>
      <p>La banque peut s'exonérer de sa responsabilité si elle démontre que le client a commis une faute grave ayant compromis la sécurité de ses données de paiement. Mais la notion de <em>faute grave</em> est interprétée strictement par les tribunaux. Elle suppose un comportement anormalement négligent, bien au-delà d'une simple erreur.</p>
      <p>Concrètement, la banque devra prouver :</p>
      <ul>
        <li>que vous avez communiqué vous-même vos identifiants à un tiers ;</li>
        <li>que vous avez validé sciemment une opération frauduleuse ;</li>
        <li>ou que vous avez répondu à un message dont le caractère suspect était patent et manifeste.</li>
      </ul>
      <p>Le fait de cliquer sur un lien contenu dans un email apparemment légitime, d'avoir été victime d'une usurpation d'identité, ou d'avoir subi un piratage à distance ne constitue pas, en soi, une faute grave.</p>

      <h2>Les principales formes de fraude</h2>

      <h3>Le phishing (hameçonnage)</h3>
      <p>Vous recevez un email ou un SMS imitant votre banque, vous demandant de vous connecter à votre espace client sur un site frauduleux. Vos identifiants sont interceptés. Des virements sont alors effectués à votre insu. La jurisprudence est favorable aux victimes : sauf à démontrer que la fraude était évidente, la banque doit rembourser.</p>

      <h3>La fraude au président</h3>
      <p>Un escroc se fait passer pour le dirigeant de votre entreprise et ordonne à votre comptable ou trésorier d'effectuer un virement urgent et confidentiel. Ces fraudes visent les PME et TPE. Plusieurs voies de recours existent : contre la banque émettrice, contre la banque réceptrice si elle pouvait détecter l'anomalie, et pénalement contre les auteurs.</p>

      <h3>Le SIM swapping</h3>
      <p>Les escrocs transfèrent votre numéro de téléphone sur une nouvelle SIM et interceptent vos SMS d'authentification. Ils accèdent alors à votre banque en ligne et effectuent des virements. Les tribunaux reconnaissent de plus en plus que cette vulnérabilité technique est imputable au système bancaire, pas au client.</p>

      <h2>Comment obtenir le remboursement ?</h2>
      <p>La démarche commence par une contestation formelle auprès de la banque, par lettre recommandée, dans les meilleurs délais. En parallèle, un dépôt de plainte pénale est indispensable pour constituer une preuve et permettre l'identification des auteurs.</p>
      <p>Si la banque refuse de rembourser ou invoque votre faute grave, c'est à elle d'en apporter la preuve devant le tribunal. Le cabinet vous accompagne pour construire et documenter votre dossier, contester le refus de remboursement et engager les procédures adaptées.</p>

      <div class="article-cta">
        <p>Vous avez été victime d'une fraude bancaire et votre banque refuse de vous rembourser ? Ne laissez pas passer les délais.</p>
        <a href="../pages/contact.html" class="btn btn--outline-white">Prendre rendez-vous</a>
      </div>
    `
  },
  {
    id: 4,
    titre: "Recouvrement de créances B2B : quelle procédure choisir selon le montant et l'urgence ?",
    date: "30 avril 2025",
    categorie: "Contentieux commercial",
    extrait: "Une facture impayée fragilise votre trésorerie. Mais toutes les procédures de recouvrement ne se valent pas : le choix dépend du montant en jeu, de l'urgence, et du comportement de votre débiteur. Voici comment s'y retrouver.",
    contenu: `
      <p>Une facture impayée fragilise votre trésorerie. Mais toutes les procédures de recouvrement ne se valent pas : le choix dépend du montant en jeu, de l'urgence, et du comportement de votre débiteur. Connaître ces outils vous permet d'agir vite et de façon adaptée.</p>

      <h2>Première étape : la mise en demeure formelle</h2>
      <p>Avant toute procédure judiciaire, il est indispensable d'adresser une mise en demeure par lettre recommandée avec accusé de réception. Ce document fait courir les intérêts moratoires (taux légal majoré en matière commerciale), interrompt la prescription et constitue la preuve que votre débiteur est en demeure de payer.</p>
      <p>En matière commerciale, les intérêts de retard sont dus de plein droit dès le lendemain de la date d'échéance de la facture, même sans mise en demeure préalable — mais la mise en demeure en cristallise le point de départ exact et renforce votre dossier.</p>

      <h2>L'injonction de payer : la procédure de référence</h2>
      <p>C'est la procédure la plus utilisée pour recouvrer une créance certaine, liquide et exigible. Elle est rapide (deux à quatre semaines en moyenne), peu coûteuse et unilatérale : le débiteur n'est pas convoqué.</p>
      <ul>
        <li><strong>Avantage</strong> : rapidité, coût limité, procédure écrite.</li>
        <li><strong>Limite</strong> : si le débiteur forme opposition, l'affaire bascule en procédure ordinaire.</li>
        <li><strong>Quand l'utiliser</strong> : créance incontestable en droit et en fait, débiteur peu diligent mais solvable.</li>
      </ul>

      <h2>Le référé-provision : quand l'urgence prime</h2>
      <p>Le référé permet d'obtenir une condamnation provisoire à payer une somme en quelques semaines, devant un juge siégeant en urgence. Il est particulièrement adapté lorsque la créance n'est pas sérieusement contestable et que votre trésorerie ne peut pas attendre.</p>
      <ul>
        <li><strong>Avantage</strong> : délai très court (deux à six semaines), exécution provisoire de droit.</li>
        <li><strong>Limite</strong> : nécessite que la créance soit difficilement contestable. Un litige sérieux sur le fond ruine l'action.</li>
        <li><strong>Quand l'utiliser</strong> : créance incontestable mais débiteur qui soulève des obstacles dilatoires, urgence avérée.</li>
      </ul>

      <h2>L'assignation au fond : pour les dossiers complexes</h2>
      <p>Lorsque le débiteur conteste sérieusement la créance (refus de payer pour vice, malfaçon, inexécution alléguée), il faut aller au fond. L'assignation au fond permet de trancher le litige dans sa globalité, avec production de pièces, conclusions et plaidoiries.</p>
      <ul>
        <li><strong>Avantage</strong> : jugement définitif, résolution des contestations de fond, condamnation aux dépens et à l'article 700.</li>
        <li><strong>Limite</strong> : durée plus longue (six à dix-huit mois selon les juridictions).</li>
        <li><strong>Quand l'utiliser</strong> : litige contesté, montants importants, nécessité de trancher sur les responsabilités.</li>
      </ul>

      <h2>Les mesures conservatoires : bloquer les actifs du débiteur</h2>
      <p>En parallèle des procédures de jugement, il est possible d'obtenir en urgence une saisie conservatoire sur les comptes bancaires ou les biens de votre débiteur, sans l'en informer préalablement. Cette mesure "gèle" des actifs à hauteur de votre créance, empêchant le débiteur de les distraire.</p>
      <p>Elle nécessite une autorisation du juge de l'exécution, obtenue sur requête, et est particulièrement utile lorsque vous avez des raisons de craindre une insolvabilité organisée.</p>

      <h2>Quel critère de choix ?</h2>
      <p>En synthèse : choisissez l'injonction de payer pour une créance simple et incontestée, le référé-provision si l'urgence est réelle et la créance solide, l'assignation au fond si le litige est complexe, et cumulez avec une saisie conservatoire si vous craignez une insolvabilité.</p>
      <p>Le cabinet vous conseille sur la stratégie la plus adaptée à votre dossier et agit rapidement pour préserver votre créance.</p>

      <div class="article-cta">
        <p>Un client ne vous paie pas ? Chaque semaine compte pour votre trésorerie. Contactez le cabinet pour agir rapidement.</p>
        <a href="../pages/contact.html" class="btn btn--outline-white">Prendre rendez-vous</a>
      </div>
    `
  },
  {
    id: 5,
    titre: "Rupture de crédit professionnel : vos droits face à une banque qui coupe le financement",
    date: "15 avril 2025",
    categorie: "Crédit professionnel",
    extrait: "Votre banque a brutalement réduit ou supprimé votre ligne de crédit, sans préavis suffisant ? Cette décision peut être abusive et engager la responsabilité de l'établissement. Voici ce que dit le droit et comment réagir.",
    contenu: `
      <p>Votre banque a brutalement réduit ou supprimé votre ligne de crédit, sans préavis suffisant ? Vous avez découvert du jour au lendemain que votre facilité de caisse ou votre ligne de découvert avait été gelée ? Cette décision peut être abusive et engager la responsabilité de l'établissement. Voici ce que dit le droit et comment réagir.</p>

      <h2>Le cadre légal de la rupture de crédit</h2>
      <p>L'article L.313-12 du code monétaire et financier organise les conditions dans lesquelles une banque peut mettre fin à un crédit accordé à une entreprise. Le principe est le suivant : tout crédit à durée indéterminée peut être dénoncé par la banque, mais cette dénonciation doit respecter un <strong>préavis de soixante jours</strong>, notifié par écrit.</p>
      <p>Ce délai de préavis n'est pas qu'une formalité. Il permet à l'entreprise d'organiser le refinancement, de trouver un autre établissement, ou d'adapter son plan de trésorerie. Sa violation caractérise la rupture abusive.</p>

      <h2>La rupture brutale sans préavis</h2>
      <p>La banque peut s'exonérer de l'obligation de préavis dans deux cas seulement : en cas de comportement gravement répréhensible du bénéficiaire du crédit, ou lorsque la situation de ce dernier s'avère irrémédiablement compromise. Ces deux notions sont interprétées strictement par les tribunaux.</p>
      <p>Une dégradation des résultats, un retard de paiement isolé, ou une simple détérioration de la situation économique de l'entreprise ne suffisent pas à justifier une rupture immédiate. La jurisprudence est sévère à l'égard des banques qui invoquent hâtivement ces exceptions pour contourner l'obligation de préavis.</p>

      <h2>Le soutien abusif : l'autre face du problème</h2>
      <p>À l'inverse, une banque qui maintient artificiellement un crédit à une entreprise dont elle sait la situation irrémédiablement compromise peut elle aussi engager sa responsabilité, à l'égard des autres créanciers de l'entreprise. C'est la théorie du soutien abusif. Ces deux logiques coexistent et il est parfois nécessaire d'analyser dans quelle situation vous vous trouvez pour identifier les recours disponibles.</p>

      <h2>Les recours disponibles</h2>

      <h3>Le référé d'urgence</h3>
      <p>Si la rupture abusive menace la survie de votre entreprise, une action en référé permet d'obtenir très rapidement — parfois en quelques jours — une décision du juge ordonnant le rétablissement provisoire du crédit ou condamnant la banque à verser une provision à valoir sur les dommages et intérêts. C'est la procédure la plus efficace en cas d'urgence avérée.</p>

      <h3>L'action au fond en responsabilité</h3>
      <p>Si l'urgence est passée ou si le dommage est déjà constitué, une action en responsabilité civile permet d'obtenir réparation du préjudice causé par la rupture abusive. Ce préjudice comprend notamment : les frais de financement alternatif plus coûteux, les pénalités de retard subies vis-à-vis de vos fournisseurs, la perte de contrats, et, dans les cas les plus graves, la disparition de l'entreprise imputable à la rupture.</p>

      <h2>Que faire en premier lieu ?</h2>
      <p>Dès que vous apprenez la décision de votre banque, trois réflexes s'imposent :</p>
      <ul>
        <li>Rassembler tous les documents relatifs au crédit : contrats, avenants, correspondances, relevés de compte.</li>
        <li>Conserver la preuve de la notification de la rupture et de sa date.</li>
        <li>Consulter rapidement un avocat pour évaluer si les conditions légales du préavis ont été respectées et quels recours sont disponibles.</li>
      </ul>
      <p>Le temps est un facteur déterminant : plus la réaction est rapide, plus les options sont nombreuses. En référé, quelques jours suffisent parfois à changer radicalement l'issue.</p>

      <div class="article-cta">
        <p>Votre banque vient de couper votre financement ? Contactez le cabinet immédiatement pour évaluer vos recours.</p>
        <a href="../pages/contact.html" class="btn btn--outline-white">Prendre rendez-vous</a>
      </div>
    `
  }
];
