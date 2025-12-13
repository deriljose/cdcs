import re

CATEGORY_KEYWORDS = {
    "software": [r"\bword\w*", r"\bexcel\w*", r"\bpowerpoint\w*", r"\blibreoffice\w*",
                 r"\boutlook\w*", r"\bapplication\w*", r"\bsoftware\w*", r"\bapp\w*", r"\bupdate\w*"],
    "hardware": [r"\bmouse\w*", r"\bkeyboard\w*", r"\bmonitor\w*", r"\bprinter\w*",
                 r"\bhardware\w*", r"\bbattery\w*", r"\bhinge\w*", r"\bdisplay\w*", r"\bscreen\w*",
                 r"\bspeaker\w*", r"\bspeakers\w*", r"\baudio\w*", r"\btouchpad\w*", r"\bfan\w*"],
    "access": [r"\baccess\w*", r"\bpermission\w*", r"\baccount\w*", r"\blogin\w*", r"\bcredential\w*"],
    "network": [r"\bwifi\w*", r"\bvpn\w*", r"\bnetwork\w*", r"\bconnection\w*", r"\blatency\w*", r"\bpacket\w*"],
    "security": [r"\bphishing\w*", r"\bmalware\w*", r"\bvirus\w*", r"\bsecurity\w*",
                 r"\bbreach\w*", r"\bransomware\w*", r"\bauthentication\w*"]
}

PRIORITY_KEYWORDS = {
    "High": [r"\burgent\w*", r"\bcritical\w*", r"\bbreach\w*", r"\bdata loss\w*",
             r"\bimmediate\w*", r"\basap\w*", r"\bmajor\w*", r"\bdown\w*",
             r"\bcan't login\w*", r"\bcannot login\w*"],
    "Medium": [r"\bcannot\w*", r"\bfail\w*", r"\berror\w*", r"\bcorrupt\w*",
               r"\bcorrupted\w*", r"\bissue\w*", r"\bproblem\w*",
               r"\bintermittent\w*", r"\bslow\w*"],
    "Low": [r"\bsmall\w*", r"\bminor\w*", r"\bno pressure\w*",
            r"\bquestion\w*", r"\bhelp\w*", r"\brequest\w*"]
}


def keyword_match_regex(description, keywords_dict):
    description_lower = description.lower()
    for key, patterns in keywords_dict.items():
        for pat in patterns:
            if re.search(pat, description_lower):
                return key
    return None


class HybridPredictor:
    def __init__(self, cat_model, prio_model):
        self.cat_model = cat_model
        self.prio_model = prio_model

    def predict(self, description):
        kw_cat = keyword_match_regex(description, CATEGORY_KEYWORDS)
        kw_prio = keyword_match_regex(description, PRIORITY_KEYWORDS)

        pred_cat = kw_cat.capitalize() if kw_cat else self.cat_model.predict([description])[0]
        pred_prio = kw_prio if kw_prio else self.prio_model.predict([description])[0]

        return pred_cat, pred_prio
